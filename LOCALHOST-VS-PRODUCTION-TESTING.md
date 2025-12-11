# 🧪 Testing Real-Time Updates: Localhost vs Production

## 📝 Quick Answer

**You CAN test on localhost**, but with important limitations:

| Feature | Localhost | Production (solesmarket.com) |
|---------|-----------|------------------------------|
| Real-time listener (Firebase users) | ✅ Works | ✅ Works |
| Polling (site password users) | ✅ Works | ✅ Works |
| Toast notifications | ✅ Works | ✅ Works |
| Manual Firebase test | ✅ Works | ✅ Works |
| **Gmail webhook** | ❌ Won't work | ✅ Works |

---

## 🔴 The Gmail Webhook Problem

**Gmail webhooks ONLY work on the production domain** because:

1. **Registered URL**: Your Gmail Push subscription is registered to `solesmarket.com`
2. **Google requires HTTPS**: Webhooks need a public HTTPS endpoint
3. **localhost is private**: Google can't send notifications to `localhost:3000`

### What This Means:
- When a real StockX email arrives → webhook fires on production only
- On localhost → webhook won't trigger
- But you can still test everything else!

---

## ✅ **BEST: Test on Localhost (No Webhook)**

### Method 1: Manual Firebase Test (Works Perfectly on Localhost)

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Open localhost:**
   ```
   http://localhost:3000/dashboard?section=purchases
   ```

3. **Open Firebase Console:**
   ```
   https://console.firebase.google.com/project/flip-flow-4d55c/firestore
   ```

4. **Navigate to `purchases` collection**

5. **Click "Add Document"**

6. **Fill in these fields:**
   ```
   - (Document ID): [Leave auto-generated]
   - userId: "20115098dd871b0a7863cd1017fa" (your site user ID)
   - orderNumber: "03-TEST-" + [random-number]
   - product: {
       name: "Nike Air Jordan 1 Retro High OG",
       brand: "Nike",
       bgColor: "bg-red-500"
     }
   - price: "$180"
   - status: "Ordered"
   - market: "StockX"
   - type: "gmail"
   - createdAt: [current timestamp: 2025-12-11T12:00:00.000Z]
   - syncedAt: [current timestamp: 2025-12-11T12:00:00.000Z]
   ```

7. **Click "Save"**

8. **Watch localhost:**
   - ✨ Toast notification should appear in top-right
   - 🟢 Purchase added to table with green glow
   - 📊 Table updates automatically (no refresh)
   - ⏱️ Toast auto-dismisses after 5 seconds

### Expected Console Output:
```
🔴 Setting up real-time listener for purchases...
✅ Real-time listener active
🔴 Real-time update: 36 purchases for user 20115098dd871b0a7863cd1017fa
✨ NEW PURCHASES DETECTED: 1
  📦 New: Nike Air Jordan 1 Retro High OG - 03-TEST-12345
🔄 Consolidation: 36 → 36 unique
```

---

### Method 2: Test Polling (Site Password Users on Localhost)

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Open:** `http://localhost:3000`

3. **Enter site password** (don't do Firebase login)

4. **Go to purchases page**

5. **Open console - should see:**
   ```
   ⏰ Setting up polling for site password user...
   ✅ Polling active (every 10 seconds)
   ```

6. **Add a purchase via Firebase** (same as Method 1)

7. **Wait up to 10 seconds** - polling will detect it

8. **Toast + green glow appear!**

---

## 🚀 **Testing on Production (solesmarket.com)**

### Method 1: Webhook Test (The Real Deal)

1. **Open:** `https://www.solesmarket.com/dashboard?section=purchases`

2. **Open browser console** (F12)

3. **Run this command:**
   ```javascript
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
   }).then(r => r.json()).then(console.log);
   ```

4. **Expected result:**
   - Webhook triggers
   - Fetches latest Gmail purchases
   - Saves to Firebase
   - Real-time listener (or polling) detects change
   - Toast + green glow appear!

5. **Check Vercel logs:**
   ```
   https://vercel.com/[your-project]/logs
   ```
   Look for:
   ```
   📬 Gmail webhook received
   ✅ Saved purchase XXX - 🔴 REAL-TIME UPDATE
   ```

---

### Method 2: Forward a Real Email

1. **Open Gmail** (on your phone or computer)

2. **Find old StockX confirmation:**
   ```
   from:noreply@stockx.com subject:"Order Confirmed"
   ```

3. **Forward it to `solesmarket23@gmail.com`**
   - Note: Forwarded emails come from YOUR email, not StockX
   - Webhook won't detect forwarded emails
   - Better to use Method 1 (webhook trigger) or Method 3

---

### Method 3: Manual Firebase (Works on Production Too)

Same as localhost Method 1, but:
- Open `https://www.solesmarket.com/dashboard?section=purchases`
- Add document to Firebase
- Real-time listener detects it instantly
- Toast + glow appear

---

## 🔍 Comparison Table

| Test Method | Localhost | Production | Tests Webhook | Tests Real-Time | Difficulty |
|-------------|-----------|------------|---------------|-----------------|------------|
| Manual Firebase | ✅ | ✅ | ❌ | ✅ | Easy |
| Console Webhook Trigger | ❌ | ✅ | ✅ | ✅ | Easy |
| Forward Real Email | ❌ | ❌* | ❌ | ❌ | Medium |
| Wait for Real StockX Email | ❌ | ✅ | ✅ | ✅ | Hard (need to buy) |

*Forwarded emails don't trigger webhook (different sender)

---

## 🎯 **Recommended Testing Flow**

### 1. **Start with Localhost + Manual Firebase**
- Fastest feedback loop
- Tests real-time listener
- Tests toast notification
- Tests green highlighting
- No webhook, but everything else works

### 2. **Move to Production + Console Webhook**
- Tests actual webhook endpoint
- Tests end-to-end flow
- Verifies Vercel deployment
- Confirms Firebase integration

### 3. **Wait for Real StockX Email** (Optional)
- Buy a sneaker on StockX
- Wait for confirmation email
- Watch it appear in real-time!
- Full production test

---

## 🐛 Troubleshooting

### Issue: "Skipping real-time listener (site password user)" on localhost

**This is normal!** Site password users use polling, not real-time listener.

**Fix:**
- Either test with polling (wait 10 seconds)
- OR login with Firebase auth to get real-time listener

---

### Issue: Webhook test on localhost returns 404

**Expected!** Webhooks only work on production.

**Fix:**
- Use Method 1 (Manual Firebase) on localhost
- OR test webhook on production (solesmarket.com)

---

### Issue: Toast doesn't appear on localhost

**Check:**
1. Did you add document to Firebase?
2. Is userId correct? Check: `localStorage.getItem('siteUserId')`
3. Console showing real-time updates?
4. Wait 10 seconds if using polling

**Fix:**
- Check console for errors
- Verify Firebase connection
- Make sure purchase has correct userId field

---

## 📊 Firebase Configuration Note

Both localhost and production use the **SAME Firebase project**:
- Project: `flip-flow-4d55c`
- This means purchases you add on localhost appear on production too!
- And vice versa
- They share the same database

---

## ✅ Quick Test Checklist

**On Localhost:**
- [ ] Start dev server: `npm run dev`
- [ ] Open: `http://localhost:3000/dashboard?section=purchases`
- [ ] Open Firebase Console
- [ ] Add test purchase document
- [ ] See toast notification
- [ ] See green glow on new purchase
- [ ] Console shows "NEW PURCHASES DETECTED"

**On Production:**
- [ ] Open: `https://www.solesmarket.com/dashboard?section=purchases`
- [ ] Open browser console
- [ ] Run webhook trigger command
- [ ] See toast notification
- [ ] See green glow
- [ ] Check Vercel logs for "REAL-TIME UPDATE"

---

## 🎉 Summary

**For 90% of testing: Use localhost + Manual Firebase**
- Fast
- Easy
- Tests everything except webhook
- No deployment needed

**For final validation: Use production + Console webhook**
- Tests full flow
- Validates deployment
- Confirms webhook works

**Both work great!** Just remember webhooks need production. 🚀

