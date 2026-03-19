require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes      = require('./routes/auth');
const userRoutes      = require('./routes/users');
const leadRoutes      = require('./routes/leads');
const leadAddRoutes   = require('./routes/leads_additions');
const followupRoutes  = require('./routes/followups');
const reportRoutes    = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');
const settingsRoutes  = require('./routes/settings');
const productRoutes   = require('./routes/products');
const emailRoutes     = require('./routes/emails');
const activityRoutes  = require('./routes/activities');
const chatRoutes      = require('./routes/chat');
const notifRoutes     = require('./routes/notifications');

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth',       authRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/leads',      leadAddRoutes);  // bulk, assign, lookup-products, comms
app.use('/api/leads',      leadRoutes);
app.use('/api/followups',  followupRoutes);
app.use('/api/reports',    reportRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/settings',   settingsRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/emails',     emailRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/chat',          chatRoutes);
app.use('/api/notifications', notifRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'ThynkFlow' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`ThynkFlow API running on port ${PORT}`));
