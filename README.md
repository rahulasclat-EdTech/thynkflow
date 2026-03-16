# ThynkFlow — EdTech CRM

A complete Lead Management CRM for EdTech sales teams.

## Project Structure

```
thynkflow/
├── backend/          # Node.js + Express REST API
├── web-admin/        # React + Vite Admin Panel
└── mobile-app/       # React Native + Expo (Android APK + iOS IPA)
```

## Quick Start

### 1. Backend
```bash
cd backend
cp .env.example .env      # fill in your DB credentials
npm install
npm run migrate           # creates all DB tables
npm run dev               # starts on http://localhost:5000
```

### 2. Web Admin Panel
```bash
cd web-admin
cp .env.example .env      # set VITE_API_URL=http://localhost:5000/api
npm install
npm run dev               # starts on http://localhost:5173
```

### 3. Mobile App
```bash
cd mobile-app
cp .env.example .env      # set API_URL=http://YOUR_IP:5000/api
npm install
npx expo start            # scan QR to test
npx expo build:android    # generate APK
npx expo build:ios        # generate IPA
```

## Hosting (Free)
- **Backend** → [Railway](https://railway.app) or [Render](https://render.com)
- **Database** → [Supabase](https://supabase.com) (free PostgreSQL)
- **Web Admin** → GitHub Pages or [Vercel](https://vercel.com)
- **Mobile** → Distribute APK directly, IPA via TestFlight

## Default Admin Login
- Email: `admin@thynkflow.com`
- Password: `Admin@123` *(change after first login)*
