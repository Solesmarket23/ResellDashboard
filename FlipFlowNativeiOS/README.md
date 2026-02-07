# Flip Flow Native (fully native iOS)

This folder contains the **fully native SwiftUI iOS app** for FlipFlow.

- **Display name**: Flip Flow Native
- **Bundle id**: `com.flipflow.app.native`
- **Project**: `FlipFlowNativeiOS/FlipFlowNative.xcodeproj`

## How to open

1. Generate the Xcode project (if needed):

```bash
cd FlipFlowNativeiOS
xcodegen generate
```

2. Open in Xcode:
- Open `FlipFlowNativeiOS/FlipFlowNative.xcodeproj`

## Firebase setup (required)

This app uses **Firebase Auth (Google)** and **Firestore** directly (no web wrapper).

1. In Firebase Console, add an **iOS app** with bundle id `com.flipflow.app.native`.
2. Download `GoogleService-Info.plist`.
3. Add it to the Xcode project:
   - Drag into Xcode under the `FlipFlowNative` target
   - Ensure **“Copy items if needed”** is checked
   - Ensure the file is included in **Target Membership** for `FlipFlowNative`

4. Update the URL scheme for Google Sign-In:
   - Open `FlipFlowNativeiOS/Resources/Info.plist`
   - Replace `__REVERSED_CLIENT_ID__` with the `REVERSED_CLIENT_ID` value from your `GoogleService-Info.plist`

Notes:
- `GoogleService-Info.plist` is intentionally ignored by git via `FlipFlowNativeiOS/.gitignore`.

## Receiving feature

The native app implements:
- Tracking lookup by scanning/typing tracking number
- Mark as received (+ optional “also mark delivered”)
- Record:
  - `authSelf` (your auth status + notes)
  - optional `authExternal` (brand QR URL + pass/fail)
  - `stockx.unitQrRaw` (StockX unit QR payload)

## Real device testing (recommended)

1. Connect your iPhone via USB.
2. In Xcode, select your iPhone as the run destination.
3. Run (▶).
4. On iPhone, allow camera permission when prompted.

## TestFlight workflow

1. Xcode: **Product → Archive**
2. In Organizer: **Distribute App → App Store Connect → Upload**
3. In App Store Connect:
   - Add to **TestFlight → Internal Testing**
   - Install from TestFlight on your phone

