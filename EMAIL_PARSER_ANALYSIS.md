# Email Parser Analysis & Improvement Plan

## 📧 Analysis of 8 Email Samples

### Email Types Collected:
1. ✅ `01-order-confirmed.eml` - "Order Confirmed:" (Regular)
2. ✅ `02-order-confirmation.eml` - "Order Confirmation:" (Regular)  
3. ✅ `03-xpress-order-confirmed.eml` - "Xpress Order Confirmed:" (Xpress)
4. ✅ `04-order-verified-shipped.eml` - "Order Verified & Shipped:" (Regular, Shipped)
5. ✅ `05-order-shipped.eml` - "Order Shipped:" (Regular, Shipped)
6. ✅ `06-xpress-order-shipped.eml` - "Xpress Order Shipped:" (Xpress, Shipped)
7. ✅ `07-xpress-ship-order-delivered.eml` - "Xpress Ship Order Delivered:" (Xpress, Delivered)
8. ✅ `08-order-delivered.eml` - "Order Delivered:" (Regular, Delivered)

## 🔍 Key Findings

### HTML Structure Pattern:
All emails use the same HTML structure:
```html
<li class="attributes">Order number: 03-PAN6QGRR7B</li>
<li class="attributes">Size: US S</li>
<li class="attributes">Style ID: FB8002-010</li>
<li class="attributes">Condition: New</li>
```

### Pricing Structure:
```html
<td>Purchase Price:</td>
<td>$65.00</td>

<td>Processing Fee:</td>
<td>$6.95</td>

<td>Shipping:</td>
<td>$14.95</td>

<td>Total Payment</td>
<td>$86.90*</td>
```

### Order Number Formats Found:
- `03-PAN6QGRR7B` (Xpress - starts with 03-)
- `01-S5SA3VAYKT` (Regular - starts with 01-)
- `01-S5UZPT3GUJ` (Xpress - starts with 01-)
- `03-PCLUUZHDNZ` (Xpress - starts with 03-)
- `01-AEBAWF` (Regular - shorter format)
- `01-S5UZPT3` (Xpress - truncated in subject?)
- `03-1E8GWKULP6` (Xpress - starts with 03-)
- `01-TBM4US948` (Regular - starts with 01-)

**Note:** Order number format doesn't reliably indicate Xpress vs Regular. Need to check subject line or other indicators.

## 🎯 Parser Improvements Needed

### 1. Quoted-Printable Decoding
**Issue:** HTML is quoted-printable encoded (`=3D` instead of `=`, `=20` instead of space)
**Fix:** Parser already handles this in `parseGmailApiMessage`, but needs to work for EML files too

### 2. Size Extraction
**Current Issue:** Matching CSS content instead of actual size
**Fix:** Need to decode HTML first, then use more specific patterns

### 3. Pricing Extraction  
**Current Issue:** Not finding prices in quoted-printable HTML
**Fix:** Decode HTML before pattern matching

### 4. Order Type Detection
**Current Issue:** Order number format doesn't reliably indicate type
**Fix:** Use subject line as primary indicator:
- "Xpress Order" in subject → Xpress
- Otherwise → Regular

## 📋 Next Steps

1. **Improve HTML Decoding** - Ensure quoted-printable is decoded before parsing
2. **Fix Size Extraction** - Use decoded HTML with specific `<li class="attributes">` patterns
3. **Fix Pricing Extraction** - Use decoded HTML with table cell patterns
4. **Improve Order Type Detection** - Use subject line as primary indicator
5. **Add Style ID Extraction** - Extract from `<li class="attributes">Style ID: ...</li>`
6. **Test All 8 Emails** - Verify 100% extraction accuracy

---

# Gmail Connection Troubleshooting

## 🔍 Common Issues

### Issue 1: Redirect URI Mismatch
**Symptom:** OAuth redirects but shows "redirect_uri_mismatch" error
**Fix:** 
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → Credentials
3. Find your OAuth 2.0 Client ID
4. Under "Authorized redirect URIs", add:
   - `https://www.solesmarket.com/api/gmail/callback`
   - `http://localhost:3000/api/gmail/callback` (for local testing)

### Issue 2: Cookies Not Being Set
**Symptom:** Connection appears successful but status check fails
**Fix:** 
- Cookies are set with domain `.solesmarket.com` 
- Make sure you're on `www.solesmarket.com` (not `solesmarket.com` without www)
- Check browser console for cookie errors

### Issue 3: Token Expired
**Symptom:** "No access token" error
**Fix:**
- Tokens expire after 7 days
- Reconnect Gmail to get fresh tokens

## 🧪 Debug Steps

1. **Check Browser Console:**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for errors when clicking "Connect Gmail"

2. **Check Network Tab:**
   - Open DevTools → Network tab
   - Click "Connect Gmail"
   - Check `/api/gmail/auth` request
   - Check redirect to Google OAuth
   - Check `/api/gmail/callback` response

3. **Check Cookies:**
   - Open DevTools → Application tab
   - Go to Cookies → `https://www.solesmarket.com`
   - Look for:
     - `gmail_access_token`
     - `gmail_refresh_token`
     - `gmail_connected`

4. **Test Status Endpoint:**
   - Open browser console
   - Run: `fetch('/api/gmail/status').then(r => r.json()).then(console.log)`
   - Check response for errors

5. **Check Google Cloud Console:**
   - Verify redirect URI matches exactly: `https://www.solesmarket.com/api/gmail/callback`
   - Check OAuth consent screen is configured
   - Verify Gmail API is enabled

## 🔧 Quick Fixes

### Fix 1: Clear Cookies and Reconnect
```javascript
// In browser console:
document.cookie.split(";").forEach(c => {
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});
// Then refresh and reconnect
```

### Fix 2: Check Redirect URI
The redirect URI must match EXACTLY in Google Cloud Console:
- ✅ `https://www.solesmarket.com/api/gmail/callback`
- ❌ `https://solesmarket.com/api/gmail/callback` (no www)
- ❌ `http://www.solesmarket.com/api/gmail/callback` (http not https)

### Fix 3: Verify Environment Variables
Check Vercel environment variables:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (optional - will auto-detect)

## 📞 What to Check Next

1. **What error do you see?**
   - In browser console?
   - On the page?
   - In network tab?

2. **What happens when you click "Connect Gmail"?**
   - Does it redirect to Google?
   - Does Google show an error?
   - Does it redirect back but not connect?

3. **Check Google Cloud Console:**
   - Is the redirect URI added?
   - Is Gmail API enabled?
   - Is OAuth consent screen configured?

Let me know what you see and I'll help debug further!

