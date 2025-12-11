# 🔴 Real-Time Purchase Updates - Testing Guide

## ✨ What Was Built

A complete real-time system that automatically updates the purchases page when new orders arrive via Gmail webhook, without requiring manual refresh.

### Features Implemented:
1. **Real-Time Listener** (Firebase users) - Instant updates via Firebase Realtime Database
2. **Polling Mechanism** (Site password users) - 10-second polling for new purchases
3. **Toast Notifications** - Animated notification in top-right corner when new purchases arrive
4. **Purchase Highlighting** - Green glowing border and pulse animation for new purchases
5. **Auto-Dismiss** - Toast auto-hides after 5 seconds with progress bar
6. **Webhook Integration** - Gmail webhook triggers save → Firebase update → UI update

---

## 🧪 How to Test

### Method 1: Webhook Test (Recommended)

1. **Navigate to Purchases Page**
   ```
   https://www.solesmarket.com/dashboard?section=purchases
   ```

2. **Open Browser Console** (F12 or Cmd+Option+I)

3. **Run the Test Script**
   ```javascript
   // Copy and paste this into the console:
   
   fetch('https://www.solesmarket.com/api/gmail/webhook', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       message: {
         data: btoa(JSON.stringify({
           emailAddress: "solesmarket23@gmail.com",
           historyId: Date.now().toString()
         })),
         messageId: `test-${Date.now()}`,
         publishTime: new Date().toISOString()
       }
     })
   })
   .then(r => r.json())
   .then(result => {
     console.log('✅ Webhook triggered:', result);
     console.log('\n👀 Watch for:');
     console.log('  1. Toast notification in top-right');
     console.log('  2. Table updates automatically');
     console.log('  3. New purchases have green glow');
     console.log('  4. Toast auto-dismisses after 5s');
   });
   ```

4. **Expected Behavior:**
   - ✨ Toast notification appears in top-right corner
   - 📊 Purchase table updates automatically (no refresh)
   - 🟢 New purchases highlighted with green glowing border
   - ⏱️ Toast auto-dismisses after 5 seconds with progress bar
   - 🎨 New rows have pulsing animation

5. **Check Vercel Logs:**
   ```
   https://vercel.com/[your-project]/logs
   ```
   Look for:
   ```
   ✅ Saved purchase [ORDER-NUMBER] - 🔴 REAL-TIME UPDATE
   ✅ Webhook saved X/Y new purchases - 🔴 REAL-TIME UPDATES TRIGGERED
   ```

---

### Method 2: Forward a Real StockX Email

1. **Find an Old StockX Order Confirmation Email**
   - In your Gmail, search: `from:noreply@stockx.com subject:"Order Confirmed"`

2. **Forward it to Yourself**
   - Gmail webhook will detect the new email
   - Webhook processes it
   - Purchase appears in real-time!

3. **Watch the Purchases Page**
   - Should update within 10 seconds (polling interval for site password users)
   - Firebase users get instant updates

**Note:** Forwarded emails won't trigger the webhook directly (they don't come from `noreply@stockx.com`), but you can use the webhook test above to simulate.

---

### Method 3: Manual Firebase Test (Firebase Users Only)

1. **Open Firebase Console**
   ```
   https://console.firebase.google.com/
   ```

2. **Navigate to Firestore Database → `purchases` collection**

3. **Click "Add Document"**

4. **Add These Fields:**
   ```
   - userId: [Copy your user ID from localStorage in browser console]
   - orderNumber: TEST-[random-number]
   - product: { name: "Test Sneaker", brand: "Nike" }
   - price: "$150"
   - status: "Ordered"
   - market: "StockX"
   - type: "gmail"
   - createdAt: [current ISO timestamp]
   - syncedAt: [current ISO timestamp]
   ```

5. **Save the Document**
   - Real-time listener will detect it instantly
   - Toast notification should appear
   - Purchase appears in table with green glow

---

## 🔍 What to Look For

### Visual Indicators:

1. **Toast Notification:**
   - Slides in from right side
   - Shows count of new purchases
   - Green/accent color glow effect
   - Progress bar at bottom (5-second countdown)
   - Close button in top-right

2. **Purchase Highlighting:**
   - Green glowing border around new purchase rows
   - Subtle pulse animation
   - Green indicator bar on left side of row
   - Brighter background color

3. **Console Logs:**
   ```
   🔴 Real-time update: [count] purchases for user [userId]
   ✨ NEW PURCHASES DETECTED: [count]
     📦 New: [product-name] - [order-number]
   ```

### For Site Password Users:
   ```
   ⏰ Setting up polling for site password user...
   ✅ Polling active (every 10 seconds)
   🔄 Polling for new purchases...
   ✨ NEW PURCHASES DETECTED via polling: [count]
   ```

### For Firebase Users:
   ```
   🔴 Setting up real-time listener for purchases...
   ✅ Real-time listener active
   🔴 Real-time update: [count] purchases for user [userId]
   ```

---

## 🐛 Troubleshooting

### Issue: Toast doesn't appear

**Check:**
1. Open browser console and look for logs
2. Verify webhook actually triggered: `✅ Webhook triggered: {received: true}`
3. Check Vercel logs for saves: `✅ Saved purchase ... - 🔴 REAL-TIME UPDATE`

**Fix:**
- If webhook triggered but no saves, check if email had purchase data
- Try the manual Firebase test to bypass webhook

---

### Issue: Purchases don't update automatically

**Site Password Users:**
- Polling runs every 10 seconds, wait a bit
- Check console for: `⏰ Setting up polling...`

**Firebase Users:**
- Check console for: `🔴 Setting up real-time listener...`
- Verify Firebase rules allow read access

**Fix:**
- Refresh page and check if listener/polling starts
- Clear browser cache
- Check network tab for API calls

---

### Issue: Green glow doesn't appear

**Check:**
1. Console logs show `✨ NEW PURCHASES DETECTED`?
2. Purchase actually new (not already in table)?

**Fix:**
- The highlight only applies to purchases that weren't in the table when the update came
- If you refresh the page, highlights clear (they're for showing what just arrived)

---

## 📊 Technical Details

### Architecture:

```
Gmail → Webhook → Firebase → Real-Time Update → UI
  ↓        ↓          ↓             ↓            ↓
Email → Parses → Saves → Detects → Shows Toast + Highlight
```

### For Site Password Users:
```
Gmail → Webhook → Firebase → Polling → UI
  ↓        ↓          ↓         ↓        ↓
Email → Parses → Saves → Checks → Shows Toast + Highlight
                         (10s)
```

### Key Components:

1. **Firebase Listener (`subscribeToCollection`)** - Real-time for Firebase users
2. **Polling (`setInterval`)** - 10-second checks for site password users
3. **Toast Component** - Animated notification with progress bar
4. **Purchase Highlighting** - CSS animations and conditional styling
5. **Webhook** - `/api/gmail/webhook` saves to Firebase with logging

---

## ✅ Success Criteria

Your real-time system is working if:

- [ ] Webhook trigger causes new purchase to appear without refresh
- [ ] Toast notification slides in and shows correct count
- [ ] New purchases have green glowing border
- [ ] Toast auto-dismisses after 5 seconds
- [ ] Console logs show real-time updates
- [ ] Vercel logs show "🔴 REAL-TIME UPDATE" messages
- [ ] Works for both Firebase and site password users

---

## 🚀 Next Steps

**Want to test with real data?**
1. Send a fresh StockX purchase email to `solesmarket23@gmail.com`
2. Wait for webhook to fire (should be immediate)
3. Watch purchases page update in real-time!

**Want more frequent updates?**
- Adjust polling interval in `Purchases.tsx` (currently 10 seconds)
- Firebase users already get instant updates

**Want to disable highlighting?**
- Highlight clears automatically after a few moments
- Or click elsewhere to remove focus

---

## 📝 Test Log Template

```
Test Date: _______
Test Method: [ ] Webhook [ ] Forward Email [ ] Manual Firebase
User Type: [ ] Firebase User [ ] Site Password User

Results:
- Toast appeared: [ ] Yes [ ] No
- Table updated: [ ] Yes [ ] No
- Green glow shown: [ ] Yes [ ] No
- Auto-dismiss worked: [ ] Yes [ ] No
- Console logs correct: [ ] Yes [ ] No

Issues Found:
_________________________________

Notes:
_________________________________
```

---

**Happy Testing! 🎉**

