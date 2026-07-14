// backend/src/routes/webhooks.js
// Public endpoint that receives Amazon SNS notifications for SES events
// (Send, Delivery, Open, Click, Bounce, Complaint, Reject) and updates
// email_logs so per-email status is visible in the Email history/report view.
//
// Setup (one-time, in AWS Console):
//   1. SES → Configuration sets → create one, note its name.
//   2. On that configuration set, enable "Open tracking" and "Click tracking".
//   3. Add an "Event destination" → SNS → create/select a topic.
//      Send: Send, Delivery, Bounce, Complaint, Reject, Open, Click.
//   4. SNS → that topic → Create subscription → protocol HTTPS →
//      endpoint = the URL from GET /api/integrations/ses-webhook-url
//      (this route auto-confirms the subscription — no manual click needed).
//   5. In ThynkFlow → Integrations → Email → Amazon SES, set
//      "Configuration Set" to the name from step 1.

const express         = require('express')
const MessageValidator = require('sns-validator')
const db               = require('../config/db')

const router    = express.Router()
const validator = new MessageValidator() // verifies the message really came from AWS SNS

function validateSnsMessage(message) {
  return new Promise((resolve, reject) => {
    validator.validate(message, err => (err ? reject(err) : resolve()))
  })
}

/** Apply one parsed SES event to the matching email_logs row. */
async function applySesEvent(event) {
  const messageId = event?.mail?.messageId
  if (!messageId) return

  const type = event.eventType || event.notificationType // SNS payload uses "eventType"
  const now  = new Date()

  switch (type) {
    case 'Send':
      await db.query(
        `UPDATE email_logs SET status='sent' WHERE ses_message_id=$1 AND status='sent'`,
        [messageId]
      )
      break

    case 'Delivery':
      await db.query(
        `UPDATE email_logs SET status='delivered', delivered_at=$2
         WHERE ses_message_id=$1 AND status NOT IN ('bounced','complained','opened','clicked')`,
        [messageId, now]
      )
      break

    case 'Open':
      await db.query(
        `UPDATE email_logs
         SET status = CASE WHEN status='clicked' THEN status ELSE 'opened' END,
             opened_at = COALESCE(opened_at, $2),
             open_count = COALESCE(open_count, 0) + 1
         WHERE ses_message_id=$1`,
        [messageId, now]
      )
      break

    case 'Click':
      await db.query(
        `UPDATE email_logs
         SET status='clicked',
             clicked_at = COALESCE(clicked_at, $2),
             click_count = COALESCE(click_count, 0) + 1
         WHERE ses_message_id=$1`,
        [messageId, now]
      )
      break

    case 'Bounce': {
      const b = event.bounce || {}
      await db.query(
        `UPDATE email_logs
         SET status='bounced', bounced_at=$2, bounce_type=$3, bounce_subtype=$4,
             error_msg=$5
         WHERE ses_message_id=$1`,
        [
          messageId, now,
          b.bounceType || null, b.bounceSubType || null,
          `SES bounce: ${b.bounceType || 'Unknown'}${b.bounceSubType ? ' / ' + b.bounceSubType : ''}`,
        ]
      )
      break
    }

    case 'Complaint':
      await db.query(
        `UPDATE email_logs SET status='complained', complained_at=$2 WHERE ses_message_id=$1`,
        [messageId, now]
      )
      break

    case 'Reject':
      await db.query(
        `UPDATE email_logs SET status='failed', error_msg='Rejected by SES before sending' WHERE ses_message_id=$1`,
        [messageId]
      )
      break

    // DeliveryDelay, Rendering Failure, Subscription: informational, no status change
    default:
      break
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/webhooks/ses
// SNS posts with Content-Type "text/plain", so this route parses the
// raw body itself rather than relying on the global express.json().
// ─────────────────────────────────────────────────────────────
router.post('/ses', express.text({ type: '*/*', limit: '2mb' }), async (req, res) => {
  let body
  try {
    body = JSON.parse(req.body)
  } catch {
    return res.status(400).send('Invalid JSON body')
  }

  // Verify this really came from AWS SNS before trusting it
  try {
    await validateSnsMessage(body)
  } catch (err) {
    console.error('[ses-webhook] SNS signature validation failed:', err.message)
    return res.status(400).send('Invalid SNS signature')
  }

  // One-time handshake: SNS requires the endpoint to fetch SubscribeURL to confirm
  if (body.Type === 'SubscriptionConfirmation') {
    try {
      await fetch(body.SubscribeURL)
      console.log('[ses-webhook] SNS subscription confirmed for topic', body.TopicArn)
    } catch (err) {
      console.error('[ses-webhook] Failed to confirm SNS subscription:', err.message)
    }
    return res.status(200).send('OK')
  }

  if (body.Type === 'UnsubscribeConfirmation') return res.status(200).send('OK')
  if (body.Type !== 'Notification')            return res.status(200).send('OK')

  let event
  try {
    event = JSON.parse(body.Message)
  } catch {
    return res.status(200).send('OK') // ack anyway so SNS doesn't retry forever
  }

  try {
    await applySesEvent(event)
  } catch (err) {
    console.error('[ses-webhook] Failed to apply SES event:', err.message)
  }

  res.status(200).send('OK')
})

module.exports = router
