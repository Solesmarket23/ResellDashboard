# eBay API Setup Guide

## 🚀 Quick Setup

### 1. Get eBay API Credentials

1. Go to [eBay Developer Program](https://developer.ebay.com/)
2. Sign in or create an account
3. Go to "My Account" → "Application Keys"
4. Create a new application:
   - **Application Type**: Public
   - **Purpose**: Browse API for price comparison
   - **API**: Browse API v1
5. Copy your credentials:
   - **App ID (Client ID)**
   - **Cert ID (Client Secret)**

### 2. Add to Environment Variables

Add these lines to your `.env.local` file:

```bash
# eBay API Credentials
EBAY_CLIENT_ID=your_app_id_here
EBAY_CLIENT_SECRET=your_cert_id_here
```

### 3. Test the Setup

Once you've added the credentials, restart your dev server:

```bash
npm run dev
```

Then try searching for "Nike Dunk Low" in the arbitrage finder.

## 🔍 What APIs We Use

- **Browse API**: Search for items, get prices, filter results
- **OAuth 2.0**: Authentication (handled automatically)
- **Sandbox**: Available for testing (production credentials work for both)

## 💡 API Limits

- **Free Tier**: 5,000 calls per day
- **Rate Limit**: 5 calls per second
- **No credit card required** for basic access

## ⚠️ Important Notes

1. **Production vs Sandbox**: Use production credentials (they work for both)
2. **No user login required**: We use app-level authentication only
3. **Browse API only**: We don't need Trading/Selling APIs
4. **US Marketplace**: Currently configured for eBay US only

## 🧪 Testing

After setup, test with this curl command:

```bash
curl -X POST http://localhost:3000/api/debug-ebay-simple \
  -H "Content-Type: application/json" \
  -d '{"query": "Nike Dunk Low"}'
```

Should return actual eBay listings instead of credential errors.

## 🔧 Troubleshooting

### "Missing eBay credentials" error:
- Make sure `.env.local` has the correct variable names
- Restart your dev server after adding credentials
- Check that there are no extra spaces in the values

### "Invalid client credentials" error:
- Verify your App ID and Cert ID are correct
- Make sure you're using production credentials
- Check that your eBay developer account is active

### "Rate limit exceeded" error:
- Wait a few seconds between searches
- Consider upgrading to higher API limits if needed

---

**Once you have the credentials set up, the arbitrage finder will work perfectly!** 🎉
