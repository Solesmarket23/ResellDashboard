# User-Specific StockX API Keys

This document explains the new user-specific StockX API key system that allows individual users to use their own API credentials instead of shared global credentials.

## Overview

The system now supports two modes of StockX API access:

1. **User-Specific API Keys** (Recommended for Level 3+ sellers)
   - Users can configure their own StockX API credentials
   - Higher rate limits and better performance
   - Access to personal sales and inventory data
   - Encrypted storage for security

2. **Global API Keys** (Fallback for other users)
   - Uses shared environment variables
   - Limited by shared rate limits
   - Basic StockX features available

## How It Works

### Priority System
The system automatically chooses which API credentials to use:

1. **User-specific keys** (if configured and valid)
2. **Global environment variables** (as fallback)
3. **Error** (if no credentials available)

### Security
- API keys are encrypted using AES-256-CBC
- Encryption key is derived from user ID + environment secret
- Keys are stored in user-specific Firestore collections
- Each user can only access their own encrypted keys

## Setup Instructions

### For Level 3+ StockX Sellers

1. **Request API Access**
   - Contact StockX to request API access for your application
   - You must be a Level 3+ seller to qualify
   - Provide your application details and use case

2. **Receive Credentials**
   - StockX will provide you with:
     - API Key
     - Client ID (optional)
     - Client Secret (optional)

3. **Configure in App**
   - Navigate to `/stockx-setup` in the application
   - Enter your API credentials
   - Test the connection
   - Complete StockX OAuth authentication

### For Other Users

- The system will automatically use shared global credentials
- No additional setup required
- Limited by shared rate limits

## Technical Implementation

### File Structure

```
src/
├── lib/
│   ├── firebase/
│   │   └── userApiKeys.ts          # API key management utilities
│   └── utils/
│       └── userApiKeyHelper.ts     # Helper functions for API calls
├── app/
│   ├── api/
│   │   └── user/
│   │       └── stockx-keys/
│   │           └── route.ts        # API routes for key management
│   └── stockx-setup/
│       └── page.tsx                # Setup page
└── components/
    ├── UserStockXApiManager.tsx    # API key management UI
    └── UserStockXSetup.tsx         # Complete setup flow
```

### Key Components

#### `userApiKeys.ts`
- `saveUserStockXKeys()` - Save encrypted API keys
- `getUserStockXKeys()` - Retrieve and decrypt API keys
- `testUserStockXKeys()` - Test API key validity
- `deleteUserStockXKeys()` - Remove user API keys

#### `userApiKeyHelper.ts`
- `getStockXApiCredentials()` - Get credentials with priority system
- `getUserIdFromRequest()` - Extract user ID from requests
- `validateApiCredentials()` - Validate credential format

#### API Routes
- `GET /api/user/stockx-keys` - Check status, test keys
- `POST /api/user/stockx-keys` - Save new keys
- `DELETE /api/user/stockx-keys` - Remove keys

### Database Schema

```typescript
// Collection: users/{userId}/apiKeys/stockx
interface UserApiKeys {
  userId: string;
  stockxApiKey: string;        // Encrypted
  stockxClientId?: string;     // Plain text (optional)
  stockxClientSecret?: string; // Encrypted (optional)
  updatedAt: string;
  isActive: boolean;
}
```

### Modified API Routes

The following StockX API routes now support user-specific keys:

- `/api/stockx/search` - Product search
- `/api/stockx/market-data` - Market data
- `/api/stockx/listings` - User listings
- `/api/stockx/sales` - Sales data
- And others...

## Environment Variables

### Required for Encryption
```bash
ENCRYPTION_SECRET=your-secure-encryption-secret
```

### Optional Global Fallback
```bash
STOCKX_API_KEY=your-global-api-key
STOCKX_CLIENT_ID=your-global-client-id
STOCKX_CLIENT_SECRET=your-global-client-secret
```

## Firebase Security Rules

Add these rules to your Firestore security configuration:

```javascript
// User API keys - users can only access their own encrypted API keys
match /users/{userId}/apiKeys/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

## Usage Examples

### Basic Setup
```typescript
import { UserStockXSetup } from '@/components/UserStockXSetup';

function MyComponent() {
  return (
    <UserStockXSetup 
      userId="user123"
      onSetupComplete={(isComplete) => {
        console.log('Setup complete:', isComplete);
      }}
    />
  );
}
```

### API Key Management
```typescript
import { UserStockXApiManager } from '@/components/UserStockXApiManager';

function MyComponent() {
  return (
    <UserStockXApiManager 
      userId="user123"
      onKeysUpdated={(hasKeys) => {
        console.log('Keys updated:', hasKeys);
      }}
    />
  );
}
```

### Programmatic Access
```typescript
import { getStockXApiCredentials } from '@/lib/utils/userApiKeyHelper';

async function makeStockXCall(userId: string) {
  const credentials = await getStockXApiCredentials(userId);
  
  if (credentials.source === 'user') {
    console.log('Using user-specific API key');
  } else if (credentials.source === 'global') {
    console.log('Using global API key');
  } else {
    throw new Error('No API credentials available');
  }
  
  // Use credentials.apiKey for API calls
}
```

## Benefits

### For Users
- **Higher Rate Limits**: Personal API keys have higher limits
- **Better Performance**: Dedicated API access
- **Personal Data**: Access to own sales and inventory
- **Security**: Encrypted storage of credentials
- **Control**: Can update/remove keys anytime

### For Application
- **Scalability**: Users provide their own API access
- **Reliability**: Reduced dependency on shared credentials
- **Performance**: Better API response times
- **Security**: User-specific encryption and isolation

## Troubleshooting

### Common Issues

1. **"No API credentials configured"**
   - User needs to configure their API keys
   - Check if global fallback is available

2. **"API test failed"**
   - Verify API key is correct
   - Check if user has proper StockX API access
   - Ensure user is Level 3+ seller

3. **"Encryption error"**
   - Verify ENCRYPTION_SECRET is set
   - Check if user ID is valid

### Debug Endpoints

- `GET /api/user/stockx-keys?userId=123&action=status` - Check key status
- `GET /api/user/stockx-keys?userId=123&action=test` - Test API keys

## Migration from Global Keys

Existing users will automatically fall back to global credentials until they configure their own API keys. No migration is required - the system handles both modes seamlessly.

## Future Enhancements

- Support for multiple API key sets per user
- Automatic key rotation
- Usage analytics and monitoring
- Integration with other resale platforms 