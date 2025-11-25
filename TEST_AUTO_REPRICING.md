# 🔍 Auto-Repricing Settings Troubleshooting

## Current Issue:
- Save button not appearing next to interval options
- Market prices not persisting after refresh

## Debug Steps:

### 1. Check Firebase Data:
Run this to see what's actually in Firebase:
```bash
npm run check-repricing-status
```

### 2. Check Browser Console:
1. Go to: https://solesmarket.com/auto-repricing-settings
2. Open browser console (F12)
3. Look for these logs:
   - "Loading settings..."
   - "Config loaded:"
   - "tempInterval:"
   - "config.intervalMinutes:"

### 3. Check if Toggle is ON:
The interval section ONLY shows if the toggle at top-right is **ON** (cyan/blue color).

If toggle is OFF (gray), you won't see any intervals.

### 4. Test Market Price Caching:
1. Go to StockX Repricing page
2. Open browser console (F12)
3. Look for: "📦 Loaded cached market prices for X listings"
4. Refresh page
5. Should see same message immediately

## Expected Behavior:

### Save Button Logic:
```
Save button appears when:
- You click an interval (tempInterval changes)
- AND that interval is different from current active (config.intervalMinutes)

Example:
- Current active: 30 minutes
- You click: 15 minutes
- Result: Save button appears next to "15 minutes"
```

### Market Price Caching:
```
1. Fetch market prices → Save to localStorage
2. Refresh page → Load from localStorage (if < 1 hour old)
3. Background fetch → Update with fresh data
```

## Quick Fix Commands:

### Force Enable Auto-Repricing:
```bash
npm run enable-repricing-now competitive 15
```

### Check Current Settings:
```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\\\\\n/g, '\\n')
    })
  });
}
const db = admin.firestore();
db.collection('users').doc('pPK6LZ0u8Qcsdxqj21yra3esJ493').get().then(doc => {
  const data = doc.data();
  console.log('Enabled:', data.stockxAutoRepricingEnabled);
  console.log('Interval:', data.stockxAutoRepricingConfig?.intervalMinutes);
  console.log('Strategy:', data.stockxAutoRepricingConfig?.strategy);
  process.exit(0);
});
"
```

## Common Issues:

### Issue 1: Toggle is OFF
**Solution:** Click the toggle at top-right to turn it ON

### Issue 2: Page hasn't loaded settings yet
**Solution:** Wait 2-3 seconds for Firebase to load

### Issue 3: Browser cache
**Solution:** Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Issue 4: Not logged in
**Solution:** Make sure you're logged into the app

## Verification:

After fixing, you should see:
1. ✅ Toggle is ON (cyan/blue)
2. ✅ "Last Repriced" and "Next Repricing" stats
3. ✅ List of interval options (5 min, 15 min, 30 min, etc.)
4. ✅ One interval has green "Active" badge
5. ✅ Clicking different interval shows Save button

