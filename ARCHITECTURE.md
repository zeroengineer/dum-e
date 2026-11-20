# Architecture

DUM-E is a modular monolith: one browser application, split into systems that only talk through
typed interfaces and events. There is no backend.

## The pipeline

```
WebcamManager            src/vision/webcam        getUserMedia, devices, stream lifecycle
    ↓ <video>
HandTracker              src/vision/mediapipe     MediaPipe Hand Landmarker, throttled loop
    ↓ RawHandFrame
LandmarkProcessor        src/vision/landmarks     mirror, One-Euro smoothing, normalisation
    ↓ TrackingFrame
GestureEngine            src/gestures             recognisers + per-hand state machines
    ↓ GestureEvent (start / update / end)
GestureEventBus          src/interaction/dispatcher
    ↓
InteractionController    src/interaction          per-environment mapping tables
    ↓ EnvironmentAction
Environment              src/environments         particles / objects / galaxy
```

Data flows one way. Each stage knows the type it receives and the type it emits and nothing else.

## Layer rules

Enforced by `no-restricted-imports` in [eslint.config.js](eslint.config.js):

- `src/vision` and `src/gestures` never import Three.js, `core`, `environments`, `rendering` or `ui`.
- `src/core`, `src/environments` and `src/rendering` never import MediaPipe, `vision`, `gestures` or `ui`.
- `src/interaction` never imports MediaPipe, Three.js, the webcam or the UI.
- Only `src/main.ts` and `src/app` (the composition root) see everything, and they only wire things together.

An environment therefore cannot tell whether an action came from a hand, a mouse or a test.

## Key contracts

| Type                | File                                | Meaning                                           |
| ------------------- | ----------------------------------- | ------------------------------------------------- |
| `RawHandFrame`      | `src/vision/landmarks/types.ts`     | Detector output, untouched                        |
| `TrackingFrame`     | `src/vision/landmarks/types.ts`     | Mirrored, smoothed, normalised hands              |
| `GestureRecognizer` | `src/gestures/recognizers/types.ts` | Pure function: hand → confidence 0..1             |
| `GestureEvent`      | `src/gestures/events/types.ts`      | A gesture starting, continuing or ending          |
| `EnvironmentAction` | `src/interaction/actions.ts`        | What a 3D scene is asked to do                    |
| `Environment`       | `src/core/scene/Environment.ts`     | Lifecycle + `handleAction` + declarative controls |

## Gesture recognition

Recognisers are stateless and only answer "how confident am I, right now, that this hand shows
gesture X". They work on wrist-centred coordinates scaled by palm size, so distance from the camera
and position in the frame do not matter.

Timing lives in one generic `GestureStateMachine` per hand per gesture:

- **Hysteresis**: a gesture starts above `enter` and only releases below a lower `exit`.
- **Debounce**: confidence must hold for `holdMs` before `start` fires.
- **Release delay**: confidence must stay low for `releaseMs` before `end` fires.
- **Cooldown**: a gesture cannot restart for `cooldownMs` (this is what stops a swipe firing twice).
- **Tracking-loss grace**: if the hand disappears, active gestures survive for a short window and
  resume seamlessly if the hand comes back.

Pose gestures (open palm, fist, pinch, point) share an exclusivity group, so one hand shows at most
one of them at a time. Adding a gesture means writing a recogniser and registering it; the engine,
bus and state machine do not change. To make an environment react, add a row to its mapping table.

## Two loops

Rendering and tracking are separate loops that never wait on each other.

- **Render loop**: one `requestAnimationFrame` in `Engine`. Stops when the tab is hidden.
- **Tracking loop**: driven by `requestVideoFrameCallback` (timer fallback), capped at the
  configured rate (default 24 Hz), skipped when the video has no new frame, paused when the tab is
  hidden or tracking is off.

Environments read the latest action state every frame and interpolate toward it, so 24 Hz input
still looks smooth at 60 fps.

## Performance decisions

- Webcam is requested at 640×480; inference cost scales with pixels and hands are large features.
- MediaPipe uses the GPU delegate and falls back to CPU if that fails. It stays on the main
  thread: at 24 Hz the cost is a few milliseconds per detection, and a worker would add a frame
  copy for every detection. Revisit only with a profile that shows dropped frames.
- Particles and stars are a single `THREE.Points` draw call each. Formation morphing, drift, hand
  forces and orbital motion run in the vertex shader; the CPU updates a handful of uniforms.
- No post-processing passes. Glow is additive blending on soft point sprites, which costs nothing
  extra and runs on integrated GPUs.
- Pixel ratio is capped by quality tier (1 / 1.5 / 2) and particle budgets scale with it. The tier
  is picked from a short frame-time probe at start-up and can be overridden in settings.
- Geometries and materials are shared between like objects and tracked per environment; switching
  environments disposes everything the old one allocated.
- One-Euro filtering smooths landmarks adaptively: heavy smoothing when the hand is still, almost
  none when it moves fast, so jitter is removed without adding lag to quick motions.

## State and UI

A single vanilla Zustand store (`src/state/store.ts`) holds screen, active environment, tracking
status, active gestures and persisted settings. The UI is plain TypeScript and CSS that subscribes
to slices of the store. High-frequency data (landmarks for the preview overlay) bypasses the store
and is drawn straight to a canvas.
