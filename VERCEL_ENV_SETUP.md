# 🔧 Vercel Environment Variables Setup

## ❌ Current Issue

The cron job is failing with:
```
{"error":"Firebase Admin not initialized","message":"Missing Firebase Admin credentials"}
```

This means the Firebase Admin credentials are not set in Vercel's environment variables.

## ✅ Solution: Add Firebase Admin Credentials to Vercel

### Step 1: Go to Vercel Dashboard

1. Visit: https://vercel.com/dashboard
2. Click on your project: **ResellDashboard** (or your project name)
3. Go to: **Settings** → **Environment Variables**

### Step 2: Add These 3 Environment Variables

Add each of these variables one by one:

#### Variable 1: NEXT_PUBLIC_FIREBASE_PROJECT_ID
- **Name:** `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- **Value:** `flip-flow-4d55c`
- **Environment:** Check all: Production, Preview, Development
- Click **Save**

#### Variable 2: FIREBASE_CLIENT_EMAIL
- **Name:** `FIREBASE_CLIENT_EMAIL`
- **Value:** `firebase-adminsdk-fbsvc@flip-flow-4d55c.iam.gserviceaccount.com`
- **Environment:** Check all: Production, Preview, Development
- Click **Save**

#### Variable 3: FIREBASE_PRIVATE_KEY
- **Name:** `FIREBASE_PRIVATE_KEY`
- **Value:** (Copy the ENTIRE private key from your .env.local file, including the `\n` characters)
```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCkreiU32lCMbAB\nKvUhu71sfjEFkRpDoR1I47X6e/vXkUYU3w15DPLdEOCdf1Y8Tb5VVzXVXA/wWdhO\nPHlO618aoqY00e5yTM/eFadvPWrK9LhKaQRIGC66pAmZ3FfD2kEf/9ZQSBRz6vtJ\ncQJNNxZxH6a8T15TTC6NOcu7km8JZDQnmKppZv1APdK7t1/02PwJrRbOf3Qzp5hw\njYafYAmU1mnCVyrTs+TaRsMM2qUT4VW1n3QLVUzb+i2RfyDxvg6NcmXgAWC8jHmm\nfOz7QczwnT6iRZidtreIDHY5GUm2EkcIWvnjlYrY/SXPPyioyA9TAdLF5p4v1Qlk\nPWCR2/lJAgMBAAECggEACF1xIAbNMPiXKSgGdaU0tQsf8FlzjRXlB+vRNZ0QqN2P\nQsYlyA1ZVNNjpXxvY/bLAUjBykm34YyeyTKXMuQP26mBadN0Gkg+kthkvejPwOl3\nZwg4mHTqAr8MYc1og+FVR4vWVhOjPlQkWZGs/UEcGbjy3kPl1bNb9f6Gk8uXalGg\n25zooXbXqyYVAQ5mRCSR/0qZKp8PaU3GIsgUtkzwENatILkUg6YrpgxDAEerPRee\nc+TuGOtv5LM5nfRrCEhA/a+Ibi2LMRKbpWeUZ+iSzC4F77nfNPuoKvhUhHcyNM8i\nX+utxc3FkJXnEcEpnDLMrEipczlBB8YSVO6h7qzbhQKBgQDROmzraCbamkQhP8L4\npshD9MO8/yJOUdSUsZZneTkKAQ+Q3t6DEb2m2I787EHhxznDU0/ozJea8tQ1br8K\n+NHGs4JWN2m4wWBjwZ8wB3ey+jI8/dOdI9LPZSDRtNAoUv0FONoxawNqhVYPG3YA\nDPayQW4+NN2a6AqpW+L6mQjOYwKBgQDJfhGBJgyaJs1PbRT7/N8bmdNmLIyXvjSR\nH03nXgI2RTRuqLQoWvCuuatjp1nRnwaAWZdyL+9jADWOOwxLcN1q/88jmQ+Dym7b\nN+aYnjONyvu5JR0XBHl3MvRLe3bVkDJ3BWfkHivl2vXwDEehi2gY7crQolxGpIYo\nIEWRoKMDYwKBgBPQ48X77Eoh+Dfp8Q5ZxXfiM7OvulEOoQKgOy17prJS3WWMJijl\nwj+OHSTJP4ghtU/RkSzsS6OKQhz5azCf1kZqc/q0btfnwLhR+0CyRFz4I0/xflxQ\nq0OnQU97P4fCLGKVOt0ZVI5/KGJv6GIi2C6T0dwkZ6SnO3NE15+CZPofAoGAI8WI\n8AfERv3Kh2ZTSmVbargFiucv0qTHClinaQMMm3vv0hGLYnq6rhpybg/A53E3I0RE\nmdYextG7sFOVXDNea+eca7J5yaj/w1WKT+AOQQcfZ4BKSNLXiaz3KAt0Tnf6LZ09\nE4ezvWwBK6vSb8CjK4HT9vRMM5Jz6t3H3BHLvwcCgYEAoT9QaXk1a0PONuOGcs2I\nHJGIvXs7KxEzcVte+6z0oxPvBLmvlBWgAyFSRybruUw54tay/8a9dM1K0+K2xSit\nK7P4O1fYpypmcA4Zo0Czdje0lO92BjYxKHI0c0rGg1RNZXGSV2cXZ000Y5n7rEXk\nunNUVP5tS+OiNWjcQmxcIpM=\n-----END PRIVATE KEY-----\n
```
- **Environment:** Check all: Production, Preview, Development
- Click **Save**

### Step 3: Redeploy

After adding all three variables, you need to trigger a new deployment:

**Option A: Push a commit (recommended)**
```bash
git commit --allow-empty -m "Trigger redeploy for env vars"
git push origin main
```

**Option B: Manual redeploy in Vercel**
1. Go to **Deployments** tab
2. Click the three dots on the latest deployment
3. Click **Redeploy**

### Step 4: Verify It Works

After redeployment, test the cron job:

```bash
npm run test-cron-reprice
```

Or visit: https://solesmarket.com/api/cron/status

You should see:
```json
{
  "status": "ready",
  "message": "Cron endpoints are configured and ready"
}
```

---

## 📋 Quick Checklist

- [ ] Add `NEXT_PUBLIC_FIREBASE_PROJECT_ID` to Vercel
- [ ] Add `FIREBASE_CLIENT_EMAIL` to Vercel
- [ ] Add `FIREBASE_PRIVATE_KEY` to Vercel (with `\n` characters)
- [ ] Redeploy the application
- [ ] Test the cron job endpoint
- [ ] Verify auto-repricing is working

---

## 🔍 Troubleshooting

### Still getting "Missing Firebase Admin credentials"?

1. **Check all three variables are set** in Vercel
2. **Make sure you selected all environments** (Production, Preview, Development)
3. **Verify the private key includes `\n`** - don't replace them with actual newlines
4. **Redeploy after adding variables** - changes don't apply to existing deployments

### How to check if variables are set?

Visit: https://solesmarket.com/api/cron/status

This endpoint will show which environment variables are present (without revealing their values).

