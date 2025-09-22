# UPS OAuth Authorization Code Flow Setup

This document explains how to set up and use the UPS OAuth Authorization Code flow with PKCE support in your resell dashboard.

## Overview

The UPS OAuth implementation supports two authentication methods:

1. **Client Credentials Flow** - For server-to-server authentication (existing implementation)
2. **OAuth Authorization Code Flow with PKCE** - For user authentication (new implementation)

## Features

- ✅ OAuth Authorization Code flow with PKCE
- ✅ Automatic token refresh
- ✅ Secure token storage
- ✅ React hooks for easy integration
- ✅ Error handling and user feedback
- ✅ Support for multiple users
- ✅ Token cleanup and management

## Setup

### 1. Environment Configuration

Add the following environment variables to your `.env.local` file:

```env
# UPS OAuth Configuration (for user authentication)
UPS_OAUTH_CLIENT_ID=your_ups_oauth_client_id_here
UPS_OAUTH_REDIRECT_URI=http://localhost:3000/api/ups/oauth/callback
UPS_OAUTH_SCOPE=ups.track ups.ship

# Existing UPS API Configuration (for client credentials)
UPS_CLIENT_ID=your_ups_client_id_here
UPS_CLIENT_SECRET=your_ups_client_secret_here
UPS_ACCOUNT_NUMBER=your_ups_account_number_here
UPS_BASE_URL=https://wwwcie.ups.com
```

### 2. UPS Developer Account Setup

1. Go to [UPS Developer Portal](https://developer.ups.com)
2. Create a new application
3. Configure OAuth settings:
   - **Redirect URI**: `http://localhost:3000/api/ups/oauth/callback`
   - **Scopes**: `ups.track ups.ship`
   - **Grant Types**: Authorization Code
4. Note down your OAuth Client ID

**Important**: The OAuth authorization URL is `https://onlinetools.ups.com/oauth/authorize` (not the API base URL)

## API Endpoints

### Authorization
- `GET /api/ups/oauth/authorize` - Start OAuth flow
- `GET /api/ups/oauth/callback` - Handle OAuth callback
- `GET /api/ups/oauth/token` - Get current token info
- `POST /api/ups/oauth/token` - Exchange code for token
- `POST /api/ups/oauth/refresh` - Refresh access token

### Success/Error Pages
- `/ups-oauth-success` - OAuth success page
- `/ups-oauth-error` - OAuth error page

## Usage

### 1. Using the React Hook

```tsx
import { useUPSOAuth } from '@/lib/hooks/useUPSOAuth';

function MyComponent() {
  const { 
    isAuthenticated, 
    isLoading, 
    error, 
    tokenInfo, 
    startAuth, 
    refreshToken, 
    logout 
  } = useUPSOAuth('user123');

  if (isAuthenticated) {
    return (
      <div>
        <p>Connected to UPS OAuth</p>
        <p>Token expires in: {tokenInfo?.expires_in} seconds</p>
        <button onClick={refreshToken}>Refresh Token</button>
        <button onClick={logout}>Disconnect</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={startAuth}>Connect with UPS</button>
      {error && <p>Error: {error}</p>}
    </div>
  );
}
```

### 2. Using the OAuth Button Component

```tsx
import UPSOAuthButton from '@/components/UPSOAuthButton';

function MyComponent() {
  return (
    <UPSOAuthButton
      userId="user123"
      onAuthSuccess={(tokenInfo) => {
        console.log('OAuth successful:', tokenInfo);
      }}
      onAuthError={(error) => {
        console.error('OAuth error:', error);
      }}
    >
      Connect with UPS
    </UPSOAuthButton>
  );
}
```

### 3. Server-Side Token Management

```typescript
import { UPSOAuthIntegrationService } from '@/lib/tracking/upsOAuthIntegration';

const oauthService = UPSOAuthIntegrationService.getInstance();

// Store user token
await oauthService.storeUserToken('user123', token, {
  email: 'user@example.com',
  name: 'John Doe',
  upsAccountNumber: '123456'
});

// Get access token for API calls
const accessToken = await oauthService.getUserAccessToken('user123');

// Refresh token
const refreshed = await oauthService.refreshUserToken('user123');
```

## OAuth Flow

### 1. Authorization Request

When a user clicks "Connect with UPS":

1. App generates PKCE code verifier and challenge
2. User is redirected to UPS authorization server
3. User logs in and authorizes the application
4. UPS redirects back with authorization code

### 2. Token Exchange

1. App receives authorization code
2. App exchanges code for access token using code verifier
3. Token is stored securely for the user
4. User is redirected to success page

### 3. API Usage

1. App retrieves stored access token
2. Token is used for UPS API calls
3. Token is automatically refreshed when needed

## Security Features

- **PKCE (Proof Key for Code Exchange)**: Prevents authorization code interception attacks
- **State Parameter**: Prevents CSRF attacks
- **Secure Token Storage**: Tokens are stored securely and not exposed in URLs
- **Automatic Refresh**: Tokens are refreshed automatically before expiration
- **Token Cleanup**: Expired tokens are automatically cleaned up

## Error Handling

The implementation includes comprehensive error handling for:

- Invalid OAuth configuration
- Network errors
- Token expiration
- Authorization failures
- State parameter mismatches
- Missing code verifiers

## Testing

### 1. Test OAuth Flow

```bash
# Start the development server
npm run dev

# Visit the OAuth authorization endpoint
curl http://localhost:3000/api/ups/oauth/authorize
```

### 2. Test Token Exchange

```bash
# Exchange authorization code for token
curl -X POST http://localhost:3000/api/ups/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "code": "authorization_code_here",
    "codeVerifier": "code_verifier_here"
  }'
```

### 3. Test Token Refresh

```bash
# Refresh access token
curl -X POST http://localhost:3000/api/ups/oauth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "refresh_token_here"
  }'
```

## Production Considerations

1. **HTTPS**: Always use HTTPS in production
2. **Database Storage**: Store tokens in a secure database instead of memory
3. **Token Encryption**: Encrypt tokens at rest
4. **Rate Limiting**: Implement rate limiting for OAuth endpoints
5. **Logging**: Log OAuth events for security monitoring
6. **Error Monitoring**: Set up error monitoring for OAuth failures

## Troubleshooting

### Common Issues

1. **"OAuth not configured"**: Check environment variables
2. **"State mismatch"**: Clear cookies and try again
3. **"No code verifier"**: Ensure PKCE flow is properly implemented
4. **"Token refresh failed"**: Check if refresh token is expired

### Debug Mode

Enable debug logging by setting:

```env
NODE_ENV=development
```

This will show detailed OAuth flow logs in the console.

## Support

For issues with UPS OAuth integration:

1. Check the [UPS Developer Documentation](https://developer.ups.com)
2. Review the error logs in your application
3. Verify your OAuth application configuration
4. Test with UPS sandbox environment first

## Files Created/Modified

- `src/lib/tracking/upsOAuth.ts` - OAuth service implementation
- `src/lib/tracking/upsOAuthIntegration.ts` - Token management service
- `src/lib/hooks/useUPSOAuth.ts` - React hook
- `src/components/UPSOAuthButton.tsx` - React component
- `src/app/api/ups/oauth/` - API routes
- `src/app/ups-oauth-success/page.tsx` - Success page
- `src/app/ups-oauth-error/page.tsx` - Error page
- `env.template` - Environment configuration
