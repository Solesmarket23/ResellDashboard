# Test Mode - Authentication Bypass

This document describes how to use the test mode authentication bypass for AI testing purposes.

## How to Use Test Mode

Add `?testMode=true` to any URL in the application to bypass authentication:

- **Dashboard**: `http://localhost:3000/dashboard?testMode=true`
- **Home Page**: `http://localhost:3000/?testMode=true`
- **Any Page**: `http://localhost:3000/[page-path]?testMode=true`

## What Test Mode Does

When test mode is enabled:

1. **Automatic Login**: You'll be automatically logged in as a test user
2. **Mock User Details**:
   - User ID: `test-user-123`
   - Email: `test@example.com`
   - Display Name: `Test User`
3. **Full UI Access**: All pages and components will be accessible
4. **Console Indicator**: You'll see "🧪 Test mode enabled - using mock user" in the console

## Limitations

- **No Real Data**: Firebase operations won't work with the mock user
- **Read-Only**: You can view the UI but data mutations won't persist
- **Testing Only**: This is only for UI/UX testing and AI site crawling

## Security Note

This test mode is intended for development and testing only. In production environments, ensure proper authentication is enforced.

## Example Usage

For AI tools to check the site:
```
https://your-domain.com/dashboard?testMode=true
```

This will allow the AI to navigate and analyze all pages without needing actual authentication credentials.