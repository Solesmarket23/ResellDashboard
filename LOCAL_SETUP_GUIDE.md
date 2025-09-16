# Local Development Setup Guide

## Prerequisites
- Node.js 20.17.0 or higher
- npm 10.8.2 or higher
- Firebase project (for authentication and database)

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Environment File
Create a `.env.local` file in the root directory with the following variables:

```env
# Firebase Configuration (Required for authentication and database)
# Get these from Firebase Console > Project Settings > General > Your apps
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id_here
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here

# Firebase Admin SDK (for server-side operations)
# Get these from Firebase Console > Project Settings > Service accounts > Generate new private key
FIREBASE_PROJECT_ID=your_project_id_here
FIREBASE_CLIENT_EMAIL=your_service_account_email_here
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n"

# Google OAuth (for Gmail integration)
# Get these from Google Cloud Console > APIs & Services > Credentials
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback

# Base URL for the application
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Optional APIs (can be left empty for basic functionality)
NEXT_PUBLIC_SOVRN_API_KEY=
DEEPGRAM_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
REPLICATE_API_TOKEN=
STOCKX_API_KEY=
EBAY_APP_ID=
EBAY_CERT_ID=
EBAY_DEV_ID=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### 3. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Enable Authentication (Email/Password)
4. Enable Firestore Database
5. Get your config from Project Settings > General > Your apps
6. For server-side operations, go to Project Settings > Service accounts > Generate new private key

### 4. Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Features Available

### Core Features (Requires Firebase)
- User authentication
- Dashboard with purchase tracking
- Gmail integration for order parsing
- StockX integration for sneaker data
- eBay integration for arbitrage opportunities

### Optional Features
- AI-powered features (OpenAI/Anthropic)
- Voice transcription (Deepgram)
- Image generation (Replicate)
- Affiliate marketing (Sovrn)

## Troubleshooting

### Firebase Auth Domain Error
If you get "auth/unauthorized-domain" errors:
1. Go to Firebase Console > Authentication > Settings > Authorized domains
2. Add `localhost` and `127.0.0.1`
3. Save and refresh your app

### Environment Variables Not Loading
1. Make sure `.env.local` is in the root directory
2. Restart the development server after adding new variables
3. Check that variable names start with `NEXT_PUBLIC_` for client-side access

### Database Permission Errors
1. Follow the `FIREBASE_SETUP.md` guide
2. Update Firestore security rules
3. Ensure you're authenticated in the app

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## Project Structure

- `src/app/` - Next.js App Router pages and API routes
- `src/components/` - React components
- `src/lib/` - Utilities, hooks, and contexts
- `src/types/` - TypeScript type definitions

