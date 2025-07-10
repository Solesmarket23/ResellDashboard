# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ResellDashboard is a comprehensive reseller management platform built with Next.js 14, focusing on sneaker reselling automation and analytics. The application integrates with Gmail for email parsing, StockX for market data and automated trading, and Firebase for data persistence.

## Key Technologies & Architecture

- **Frontend**: Next.js 14 App Router, React 18, TypeScript, TailwindCSS
- **Backend**: Next.js API routes, Firebase (Auth, Firestore, Storage)
- **Integrations**: Gmail API, StockX API, Deepgram (audio), Anthropic AI, Replicate
- **Mobile**: Capacitor (iOS/Android apps)
- **Barcode Scanning**: Multiple implementations (@capacitor-mlkit/barcode-scanning, @zxing/library, html5-qrcode)

## Essential Commands

### Development
```bash
npm run dev          # Start development server (binds to 0.0.0.0)
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Mobile Development
```bash
npx cap add ios      # Add iOS platform
npx cap add android  # Add Android platform  
npx cap sync         # Sync web assets to native platforms
npx cap open ios     # Open iOS project in Xcode
npx cap open android # Open Android project in Android Studio
```

## Core Architecture

### File Structure
- `src/app/` - Next.js App Router pages and layouts
- `src/app/api/` - API routes organized by service (gmail, stockx, debug, etc.)
- `src/components/` - React components (Dashboard, StockX integrations, etc.)
- `src/lib/` - Utilities, contexts, hooks, and Firebase configuration
- `android/` and `ios/` - Native mobile app projects (Capacitor)

### Key Components & Systems

#### Email Processing System
- **Location**: `src/app/api/gmail/`
- **Purpose**: Parses purchase confirmation emails from sneaker retailers
- **Key Files**: 
  - `purchases/route.ts` - Main email processing endpoint
  - `src/lib/email/orderConfirmationParser.ts` - Email parsing logic
- **Features**: Order tracking, delivery status updates, automatic categorization

#### StockX Integration
- **Location**: `src/app/api/stockx/` and `src/components/StockX*.tsx`
- **Purpose**: Market data, automated repricing, inventory management
- **OAuth Flow**: Implements full StockX OAuth with refresh tokens
- **Key Features**: Price monitoring, automatic listing adjustments, sales tracking

#### Firebase Data Layer
- **Configuration**: `src/lib/firebase/firebase.ts`
- **Collections**: purchases, sales, profiles, themes, emailConfigs, dashboardSettings
- **Real-time**: Uses Firestore real-time listeners for live data updates
- **Authentication**: Firebase Auth with Google OAuth

#### Dashboard System
- **Main Component**: `src/components/Dashboard.tsx`
- **Features**: Real-time metrics, sales analytics, profit calculations
- **Data Sources**: Combines purchases (email parsed) and sales (manual/StockX) data
- **Themes**: Dynamic theming system with multiple pre-built themes

### State Management Patterns

#### Custom Hooks
- `useSales` - Real-time sales data with Firestore listeners
- `useAuth` - Firebase authentication state management
- **Location**: `src/lib/hooks/`

#### Context Providers
- `AuthContext` - User authentication and profile state
- `ThemeContext` - Application theming and preferences
- `DeepgramContext` - Audio transcription setup
- **Location**: `src/lib/contexts/`

### API Route Organization

#### Gmail API (`/api/gmail/`)
- `auth/` - Gmail OAuth flow initiation
- `callback/` - OAuth callback handler
- `purchases/` - Email parsing and purchase extraction
- `debug-order/` - Debugging specific order numbers
- `fix-delivery-status/` - Retroactive delivery status updates

#### StockX API (`/api/stockx/`)
- `auth/`, `callback/` - OAuth flow
- `listings/`, `sales/` - Inventory and transaction management
- `repricing/` - Automated price adjustments
- `market-data/` - Price research and analytics
- `test-*` - Various testing endpoints for API validation

#### Debug API (`/api/debug/`)
- Development and troubleshooting endpoints for data analysis

## Development Guidelines

### Database Patterns
- All user data is scoped by `userId` field
- Use `getDocuments()` and `addDocument()` from `firebaseUtils.ts`
- Implement real-time listeners for live data updates
- Always handle offline/error states gracefully

### Email Parsing
- Add new retailer patterns to `orderConfirmationParser.ts`
- Test parsing with `debug-order` endpoint
- Categories: orderPlaced, orderShipped, orderDelivered, orderCanceled, refundIssued

### StockX Integration
- Always check token validity before API calls
- Implement proper error handling for rate limits
- Use batch operations for bulk data updates
- Test with sandbox endpoints when available

### Mobile Considerations
- Barcode scanning available via multiple implementations
- Capacitor provides native capabilities
- Test on both iOS and Android simulators/devices
- Sync changes with `npx cap sync` after code changes

### Testing & Debugging
- Use browser dev tools for Firebase connection state
- Check `dev.log` for Next.js development logs
- StockX API has specific test endpoints for validation
- Email parsing can be debugged with order numbers via debug endpoints

## Environment Variables Required

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN  
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

STOCKX_CLIENT_ID
STOCKX_CLIENT_SECRET

GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET

DEEPGRAM_API_KEY
ANTHROPIC_API_KEY
REPLICATE_API_TOKEN
```

## Common Tasks

### Adding New Email Retailer
1. Add patterns to `orderConfirmationParser.ts`
2. Test with `debug-order` endpoint
3. Update email configuration UI in components

### StockX Feature Development
1. Check existing StockX components for patterns
2. Use OAuth flow for authentication
3. Implement error handling for API limits
4. Test with sandbox/test endpoints first

### Adding New Dashboard Metrics
1. Update calculation logic in `Dashboard.tsx`
2. Consider real-time data requirements
3. Add to `realMetrics` state object
4. Update metric cards array