# iOS App Development Guide

This guide explains how to develop, test, and deploy your Flip Flow dashboard as a native iOS app using Capacitor.

## 🚀 Quick Start

### Prerequisites
- Mac with macOS (required for iOS development)
- Xcode installed (from App Store)
- Node.js and npm installed
- Your Next.js dev server running

### Development Workflow

#### Option 1: Quick Development (Recommended)
```bash
# Terminal 1: Start your Next.js dev server
npm run dev

# Terminal 2: Open iOS app in Xcode
npm run ios:dev
```

#### Option 2: Build and Test
```bash
# Build Next.js and open in Xcode
npm run ios:build
```

## 📱 Testing in Simulator

### Step 1: Start Your Dev Server
```bash
npm run dev
# Server will run at http://localhost:3000
```

### Step 2: Open in Xcode
Xcode should already be open from the setup. If not:
```bash
npm run cap:open:ios
```

### Step 3: Select Simulator
In Xcode:
1. Click the device selector next to the "Play" button (top left)
2. Choose a simulator (e.g., "iPhone 16 Pro")
3. Click the ▶️ Play button to run

### Step 4: App Launches!
- Simulator will open
- Your app will install and launch
- It will load your dashboard from `localhost:3000`

## 🔄 How Live Reload Works

### Development Mode
When `CAPACITOR_DEV=true`, the app loads from your local dev server:

```
iOS App → http://localhost:3000 → Your Next.js Dev Server
```

**Benefits:**
- ✅ Edit React components
- ✅ Save file
- ✅ App auto-refreshes
- ✅ See changes instantly!

**To refresh manually:** Cmd+R in the simulator

### Production Mode
When deployed, the app loads from your production URL:

```
iOS App → https://your-domain.vercel.app → Your Live Site
```

**Benefits:**
- ✅ Admin updates website
- ✅ All iOS apps update instantly
- ✅ No App Store approval needed for content changes

## 🛠️ Available Commands

### Capacitor Commands
```bash
# Sync web assets to iOS (after making changes)
npm run cap:sync:ios

# Open iOS project in Xcode
npm run cap:open:ios

# Run app in simulator (all-in-one)
npm run cap:run:ios

# Sync all platforms
npm run cap:sync
```

### Development Commands
```bash
# Development mode: Live reload from localhost
npm run ios:dev

# Production mode: Test with built files
npm run ios:build
```

## 🐛 Debugging

### Safari Web Inspector (Best for Capacitor!)

1. Run your app in the simulator
2. Open Safari on your Mac
3. Go to: **Safari → Develop → Simulator → [Your App]**
4. Full DevTools opens!

You get:
- Console logs
- Network tab (see all API calls)
- Elements inspector
- JavaScript debugger
- Performance profiler

### Xcode Console

View native iOS logs:
1. In Xcode, go to: **View → Debug Area → Show Debug Area**
2. See native logs and errors

### Common Issues

#### App shows blank screen
- Make sure your dev server is running (`npm run dev`)
- Check the Xcode console for errors
- Verify the URL in Safari Web Inspector

#### "Cannot connect to localhost"
- Ensure dev server is running on `0.0.0.0` (already configured)
- Check firewall settings
- Try restarting the simulator

#### Changes not appearing
- Refresh the app: Cmd+R in simulator
- Or re-sync: `npm run cap:sync:ios`

## 📸 Testing Native Features

### Barcode Scanner
The barcode scanner is already configured!

```typescript
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

// In your component
const scanBarcode = async () => {
  const result = await BarcodeScanner.startScan();
  console.log('Scanned:', result.barcode.rawValue);
};
```

**Note:** Barcode scanning works best on a real device. In the simulator, it uses simulated camera input.

### Testing on Real Device

1. Connect your iPhone to Mac with USB cable
2. In Xcode, select your iPhone from device list
3. Click ▶️ Run
4. First time: Trust your Mac on iPhone
5. App installs and runs on your phone!

**Free Apple Developer Account:**
- You can test on your own device for free
- Go to Xcode → Preferences → Accounts
- Add your Apple ID
- Xcode will create a free provisioning profile

## 🔧 Configuration Files

### capacitor.config.ts
Main Capacitor configuration:

```typescript
// Development: Loads from localhost
server: {
  url: 'http://localhost:3000',
  cleartext: true
}

// Production: Loads from your live site
server: {
  url: 'https://your-domain.vercel.app',
  cleartext: false
}
```

### next.config.mjs
Next.js configuration for Capacitor:

```javascript
distDir: 'out', // Output directory for Capacitor
```

### ios/App/Podfile
iOS dependencies (CocoaPods):

```ruby
platform :ios, '16.0'  # Minimum iOS version
```

## 🌐 Firebase Integration

Your Firebase setup works identically in the iOS app!

### Authentication
```typescript
// Same code as web
import { auth } from '@/lib/firebase/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

// Works in iOS app!
await signInWithEmailAndPassword(auth, email, password);
```

### Firestore Real-Time
```typescript
// Real-time updates work perfectly
import { onSnapshot, collection } from 'firebase/firestore';

onSnapshot(collection(db, 'inventory'), (snapshot) => {
  // Updates instantly when admin changes data!
  setInventory(snapshot.docs.map(doc => doc.data()));
});
```

### Storage
```typescript
// Upload images from iOS camera
import { getStorage, ref, uploadBytes } from 'firebase/storage';

const storage = getStorage();
const imageRef = ref(storage, 'images/photo.jpg');
await uploadBytes(imageRef, file);
```

## 📦 What Gets Bundled

### Development Mode
- Only Capacitor native code
- App loads everything from localhost
- Smallest app size
- Requires dev server running

### Production Mode (Server URL)
- Capacitor native code
- App loads from your live website
- Small app size (~10-20 MB)
- Requires internet connection

### Production Mode (Bundled)
- Capacitor native code
- All HTML/CSS/JS files included
- Larger app size (~50-100 MB)
- Works offline (for UI)

## 🚀 Deployment Modes

### Mode 1: Server Mode (Recommended)
**Best for:** Frequently updated dashboards

```typescript
// capacitor.config.ts
server: {
  url: 'https://your-dashboard.vercel.app'
}
```

**Pros:**
- ✅ Instant updates (no app store approval)
- ✅ Smaller app size
- ✅ Same as web version

**Cons:**
- ❌ Requires internet
- ❌ Slightly slower initial load

### Mode 2: Bundled Mode
**Best for:** Offline-first apps

```typescript
// capacitor.config.ts
// Remove or comment out server config
```

**Pros:**
- ✅ Works offline
- ✅ Faster initial load
- ✅ More "native" feel

**Cons:**
- ❌ App updates needed for UI changes
- ❌ Larger app size

### Mode 3: Hybrid Mode (Best of Both)
**Best for:** Your use case!

```typescript
// App loads from server (instant updates)
// But data syncs via Firebase (real-time)
// Native features work offline
```

**Pros:**
- ✅ Instant UI updates
- ✅ Real-time data sync
- ✅ Native features work
- ✅ Reasonable app size

## 🎯 Recommended Setup for Your Dashboard

Based on your resell dashboard, here's the ideal configuration:

### Development
```bash
# Terminal 1
npm run dev

# Terminal 2  
npm run ios:dev

# Edit code → Save → See changes instantly!
```

### Production
```typescript
// capacitor.config.ts
server: {
  url: 'https://your-vercel-app.vercel.app',
  cleartext: false
}
```

**Why this works:**
1. Your dashboard changes frequently (prices, inventory)
2. Firebase handles all data sync (real-time updates)
3. Admin updates website → All apps update instantly
4. No app store approval for content changes
5. Barcode scanner and native features still work

## 📱 App Store Preparation

When you're ready to publish:

### 1. Update App Info
In Xcode:
- App name, version, bundle ID
- App icons (all required sizes)
- Launch screen

### 2. Configure Signing
- Xcode → Signing & Capabilities
- Select your team
- Automatic signing (easiest)

### 3. Build for Release
- Select "Any iOS Device (arm64)"
- Product → Archive
- Upload to App Store Connect

### 4. App Store Connect
- Create app listing
- Add screenshots, description
- Submit for review

**Note:** Apple review takes 1-2 days typically.

## 🔄 Update Strategy

### Content Updates (No Review Needed)
- Update your website
- All apps get changes instantly
- No app store submission

### Native Updates (Review Required)
- New native features
- Capacitor plugin updates
- iOS version changes
- Submit new version to App Store

### Feature Flags
Control features remotely via Firebase:

```typescript
// In Firebase config document
{
  features: {
    barcodeScanner: true,
    newFeature: false  // Turn on when ready!
  }
}

// In your app
{features.newFeature && <NewFeatureComponent />}
```

Turn features on/off without app updates!

## 🎓 Next Steps

1. **Test in Simulator**
   - Click ▶️ in Xcode
   - Explore your dashboard
   - Test all features

2. **Test on Real Device**
   - Connect iPhone
   - Run from Xcode
   - Test barcode scanner

3. **Configure Production URL**
   - Deploy to Vercel/your host
   - Update `capacitor.config.ts`
   - Test production mode

4. **Add App Icons**
   - Design app icon
   - Add to Xcode asset catalog
   - Add launch screen

5. **Submit to App Store**
   - Create App Store Connect listing
   - Archive and upload
   - Submit for review

## 📚 Additional Resources

- [Capacitor Docs](https://capacitorjs.com/docs)
- [iOS Plugin Development](https://capacitorjs.com/docs/plugins/ios)
- [App Store Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Firebase iOS Setup](https://firebase.google.com/docs/ios/setup)

## 💡 Tips & Tricks

### Faster Development
- Keep dev server running
- Use Cmd+R to refresh app
- Use Safari Web Inspector for debugging

### Better Performance
- Optimize images
- Minimize API calls
- Use Firebase real-time listeners efficiently

### Native Feel
- Use iOS-style components
- Respect safe areas (notch)
- Use native navigation patterns
- Add haptic feedback

### Debugging
- Check Safari Web Inspector first
- Then check Xcode console
- Use `console.log` liberally
- Test on real device for native features

## 🎉 You're Ready!

Your iOS app is now set up and ready to go! 

**Current Status:**
- ✅ Capacitor configured
- ✅ iOS project synced
- ✅ Xcode opened
- ✅ Ready to run in simulator

**Next:** Click the ▶️ button in Xcode to launch your app!

---

Need help? Check the troubleshooting section or reach out to the team.





