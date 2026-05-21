---
name: Work screens must keep device awake
description: Worker screens (capture flow + especially cleaning timer) must prevent the screen from auto-locking while active; use expo-keep-awake
type: feedback
originSessionId: 347b6c25-58bd-48ad-b5ea-b9afb772c022
---
Worker-facing work screens MUST prevent the phone's auto-lock/screen-off behavior while they're active. Use `expo-keep-awake`'s `useKeepAwake()` hook on every screen the worker stares at or uses during active field work.

**Why:** Workers on-site experienced screens turning off repeatedly while cleaning — user feedback from 2026-04-15: "dont turn off screen while doing work it was offing again and again." Default Android auto-lock (30-60s typical) is not compatible with a 20-30 minute cleaning timer or with workers who set the phone down to do manual labor between photo steps.

**How to apply:**
- **Mandatory**: `CleaningTimerScreen` (workers stare at it for 20-30 min), `CameraScreen` (both BEFORE and AFTER modes — they're scanning viewfinders, may take photos intermittently), `QRScanScreen` (briefly, could fail if screen dims while positioning), `FinalReviewScreen` (reviewing photos before submit)
- **Optional**: `GalleryScreen`, `SuccessScreen` (brief views — probably not critical but safe to add)
- **Don't apply** to `WorkerHomeScreen` / `HistoryScreen` / `ProfileScreen` / any supervisor screen — those are "review mode" and normal auto-lock is fine (battery)
- Implementation: `import { useKeepAwake } from 'expo-keep-awake';` then call `useKeepAwake();` inside the component (no arg = always keep awake while mounted; unique tag optional)
- Install: `npx expo install expo-keep-awake` if not already in package.json (it's part of the Expo SDK but not installed by default)
