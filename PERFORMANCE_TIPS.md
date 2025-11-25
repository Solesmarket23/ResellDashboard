# iOS App Performance Tips

## Understanding the Lag

The lag you're experiencing is because the app loads from your dev server over WiFi:

```
iOS App → WiFi → Your Mac (192.168.12.40:3000) → Next.js Dev Server
```

Every click, every page load goes over the network, which adds ~100-300ms delay.

## Quick Fixes

### Option 1: Accept Dev Mode Lag (Current Setup)
**Pros:**
- Live reload - see changes instantly
- Easy debugging
- No build step

**Cons:**
- Noticeable lag on clicks/navigation
- Requires dev server running
- Network dependent

**Best for:** Active development when you're making changes

### Option 2: Use Production Mode (Fastest!)
**Pros:**
- ⚡ **No lag!** Everything is instant
- Works offline
- Native app feel

**Cons:**
- Need to rebuild for changes
- No live reload

**Best for:** Testing final experience, demos, or when not actively coding

**How to switch:**
1. Comment out the `server` config in `capacitor.config.ts`
2. Build your app: `npm run build` (fix build errors first)
3. Sync: `npx cap sync ios`
4. Run in Xcode

### Option 3: Hybrid Approach (Recommended)
Use dev mode when coding, production mode when testing:

```bash
# Development (with lag but live reload)
npm run ios:dev

# Production (no lag, native feel)
npm run ios:build  # After fixing build errors
```

## Why the Warnings Don't Matter

The console warnings you see are **normal iOS debug messages**:

### "UIScene lifecycle" Warning
- This is just a deprecation notice
- Doesn't affect performance
- Can be ignored

### "Unable to simultaneously satisfy constraints"
- iOS auto-layout warnings
- System resolves them automatically
- Doesn't cause lag

### "Hang detected" Messages
- Only shows because debugger is attached
- Wouldn't show in production
- Not actual hangs

## What Actually Causes Lag

### Network Latency
```
User taps button
  ↓ ~50ms
Request goes over WiFi
  ↓ ~100ms
Reaches dev server
  ↓ ~50ms
Server responds
  ↓ ~100ms
Response travels back
  ↓ ~50ms
App updates
───────────
Total: ~350ms delay
```

### Dev Server Overhead
- Next.js dev server is slower than production
- Hot reload adds overhead
- Source maps slow things down

## Optimization Strategies

### 1. Reduce Network Requests

**Current:** Every navigation = new request
**Better:** Cache pages, prefetch data

Add to your components:
```typescript
// Prefetch data
useEffect(() => {
  // Load data in background
  prefetchData();
}, []);
```

### 2. Optimize Images

```typescript
// Use Next.js Image component
import Image from 'next/image';

<Image
  src="/shoe.png"
  width={200}
  height={200}
  priority // Loads immediately
/>
```

### 3. Reduce Bundle Size

```bash
# Analyze what's making your app slow
npm install @next/bundle-analyzer
```

### 4. Use React.memo for Heavy Components

```typescript
const HeavyComponent = React.memo(({ data }) => {
  // Expensive rendering
  return <div>{data}</div>;
});
```

### 5. Debounce Input

```typescript
import { useState, useEffect } from 'react';

const [searchTerm, setSearchTerm] = useState('');
const [debouncedTerm, setDebouncedTerm] = useState('');

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedTerm(searchTerm);
  }, 300); // Wait 300ms after user stops typing

  return () => clearTimeout(timer);
}, [searchTerm]);
```

## Testing Performance

### Measure Network Time
In Safari Web Inspector:
1. Safari → Develop → Simulator → Your App
2. Network tab
3. See how long each request takes

### Measure Render Time
```typescript
useEffect(() => {
  const start = performance.now();
  // Your code
  const end = performance.now();
  console.log(`Render took ${end - start}ms`);
}, []);
```

## Production Build Checklist

To fix the build errors and enable production mode:

1. **Fix Missing Files**
```bash
# Check what's missing
npm run build

# You'll see errors like:
# Module not found: Can't resolve '@/lib/email/parse'
```

2. **Create Missing Files or Remove Imports**
```typescript
// Option 1: Create the missing file
// Option 2: Comment out the import if not needed
```

3. **Test Build**
```bash
npm run build
# Should complete without errors
```

4. **Sync to iOS**
```bash
npm run ios:build
```

## Expected Performance

### Dev Mode (Current)
- Button clicks: ~200-400ms
- Page navigation: ~300-500ms
- Data loading: ~500-1000ms

### Production Mode
- Button clicks: ~50-100ms ⚡
- Page navigation: ~100-200ms ⚡
- Data loading: ~200-400ms ⚡

## Quick Win: Disable Source Maps in Dev

Add to `next.config.mjs`:
```javascript
const nextConfig = {
  // ... existing config
  productionBrowserSourceMaps: false,
  webpack: (config, { dev }) => {
    if (dev) {
      config.devtool = 'eval-cheap-source-map'; // Faster than default
    }
    return config;
  },
};
```

## Haptic Feedback Timing

The haptics are instant! The lag you feel is from:
1. Network request (~300ms)
2. Page render (~100ms)

The haptic itself fires in ~10ms.

## Bottom Line

**For Development:** Accept the lag, enjoy live reload
**For Testing:** Fix build errors, use production mode
**For Production:** Always use production build

The lag is **normal for dev mode** and will disappear in production!

---

**Current Status:** Dev mode with network lag (normal)
**To Fix:** Build production version (requires fixing build errors)
**Workaround:** Test on real device with good WiFi for slightly better performance



