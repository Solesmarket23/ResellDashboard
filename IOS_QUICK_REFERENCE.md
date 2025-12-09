# iOS App Quick Reference

## 🚀 Daily Development Commands

```bash
# Start dev server (Terminal 1)
npm run dev

# Open iOS app (Terminal 2)
npm run ios:dev

# That's it! Edit code and see changes instantly.
```

## 📱 Testing

### In Simulator
1. Xcode → Select device (iPhone 16 Pro)
2. Click ▶️ Play button
3. App launches in simulator
4. Refresh: Cmd+R

### On Real Device
1. Connect iPhone via USB
2. Xcode → Select your iPhone
3. Click ▶️ Play button
4. Trust Mac on iPhone (first time)

## 🐛 Debugging

### Safari Web Inspector (Primary)
Safari → Develop → Simulator → [Your App]

### Xcode Console (Secondary)
View → Debug Area → Show Debug Area

## 🔄 Common Tasks

### After Changing Capacitor Config
```bash
npm run cap:sync:ios
```

### After Installing New Plugin
```bash
npm install @capacitor/plugin-name
npm run cap:sync:ios
```

### Reset Everything
```bash
cd ios/App
rm -rf Pods Podfile.lock
pod install
cd ../..
npm run cap:sync:ios
```

## 📝 File Locations

| What | Where |
|------|-------|
| Capacitor config | `capacitor.config.ts` |
| iOS project | `ios/App/` |
| iOS dependencies | `ios/App/Podfile` |
| Native code | `ios/App/App/` |
| Web assets | `ios/App/App/public/` |

## 🎯 Quick Fixes

### Blank Screen
- ✅ Is dev server running? (`npm run dev`)
- ✅ Check Xcode console for errors
- ✅ Refresh: Cmd+R

### Can't Connect to Localhost
- ✅ Dev server on `0.0.0.0`? (already configured)
- ✅ Restart simulator
- ✅ Check firewall

### Changes Not Showing
- ✅ Refresh: Cmd+R
- ✅ Re-sync: `npm run cap:sync:ios`
- ✅ Rebuild in Xcode

### Pod Install Fails
```bash
export LANG=en_US.UTF-8
cd ios/App
pod install
```

## 🔌 Native Features

### Barcode Scanner
```typescript
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
const result = await BarcodeScanner.startScan();
```

### Camera
```typescript
import { Camera } from '@capacitor/camera';
const photo = await Camera.getPhoto({...});
```

### Check if Native
```typescript
import { Capacitor } from '@capacitor/core';
if (Capacitor.isNativePlatform()) {
  // Running in iOS app
}
```

## 🌐 Modes

### Development (Current)
- Loads from: `http://localhost:3000`
- Live reload: ✅
- Requires: Dev server running

### Production (Deploy)
- Loads from: Your production URL
- Live reload: ✅ (from server)
- Requires: Internet connection

## 📦 NPM Scripts

| Command | What It Does |
|---------|--------------|
| `npm run dev` | Start Next.js dev server |
| `npm run ios:dev` | Sync & open Xcode (dev mode) |
| `npm run ios:build` | Build & open Xcode (prod mode) |
| `npm run cap:sync:ios` | Sync web assets to iOS |
| `npm run cap:open:ios` | Open Xcode |
| `npm run cap:run:ios` | Build & run in simulator |

## 🎨 Customization

### Change App Name
`ios/App/App/Info.plist` → `CFBundleDisplayName`

### Change App Icon
Xcode → App → Assets → AppIcon

### Change Launch Screen
Xcode → App → LaunchScreen.storyboard

### Change Bundle ID
Xcode → App → Signing & Capabilities → Bundle Identifier

## 🚀 Deployment Checklist

- [ ] Test all features in simulator
- [ ] Test on real device
- [ ] Add app icons (all sizes)
- [ ] Add launch screen
- [ ] Configure signing
- [ ] Update version number
- [ ] Build archive
- [ ] Upload to App Store Connect
- [ ] Submit for review

## 💡 Pro Tips

- Keep dev server running while developing
- Use Safari Web Inspector for debugging (not Xcode)
- Test native features on real device
- Use Firebase for real-time data sync
- Update website for instant app updates
- Use feature flags for remote control

## 🆘 Need Help?

1. Check `IOS_APP_GUIDE.md` for detailed docs
2. Check Xcode console for errors
3. Check Safari Web Inspector console
4. Try restarting simulator
5. Try re-syncing: `npm run cap:sync:ios`

---

**Currently:** Xcode is open and ready to run your app!
**Next Step:** Click ▶️ in Xcode to launch in simulator.






