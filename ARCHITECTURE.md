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
Environment              src/environments         particles / objects / galaxy / globe
```

Data flows one way. Each stage knows the type it receives and the type it emits and nothing else.

## Layer rules

Enforced by `no-restricted-imports` in [eslint.config.js](eslint.config.js):

- `src/vision` and `src/gestures` never import Three.js, `core`, `environments`, `rendering` or `ui`.
- `src/core`, `src/environments` and `src/rendering` never import MediaPipe, `vision`, `gestures` or `ui`.
- `src/interaction` never imports MediaPipe, Three.js, the webcam or the UI.
- Only `src/main.ts` and `src/app` (the composition root) see everything, and they only wire things together.
  `App` creates every system and joins it to its neighbours; `TrackingSession` is the one place the
  camera, tracker, landmark processor and gesture engine are connected.
- Mouse and keyboard (`FallbackInput`) publish the same `GestureEvent`s on the same bus, marked
  `source: 'fallback'`, so there is one input path into the environments.

An environment therefore cannot tell whether an action came from a hand, a mouse or a test.

## Worlds that draw the camera picture

Most worlds only need to know roughly where a hand points, so their actions carry a pointer that
is stretched (the middle of the camera image covers the whole screen) and clamped. A world that
shows the camera picture itself needs the opposite: positions that land exactly on the hand in the
picture. Two things reach such a world, and neither breaks the layer rules:

- **The picture.** `App` passes the camera's `<video>` element to `Engine.setVideo` whenever the
  camera comes on or goes off; the engine puts it in `EnvironmentContext.video` and calls the
  optional `Environment.setVideo`. The element is a DOM type, so no rendering code imports
  `vision`. It is for display only.
- **The hands.** The `anchor` and `span` actions carry positions in the mirrored camera image
  (`space: 'image'`, u right and v down, 0..1), unstretched, with palm size, roll, fingertips and
  the gap between two palms. The world fits the image to the screen itself with
  `src/core/camera/videoFit.ts`, using the same fit for the picture and for the positions, then
  places them in the scene with `ndcToPlane`. Mouse input uses the same actions with
  `space: 'screen'`.

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
- Building tens of thousands of particle, star or dot positions happens in one background
  worker shared by every world (`src/environments/generation/`), with the buffers transferred
  rather than copied. Changing formation, galaxy shape or quality no longer drops frames; the
  main thread only uploads the result. Where a worker cannot start, the same code runs on the
  main thread.
- Each world is its own chunk, fetched the first time it is opened and prefetched when the page
  is idle. Switching is asynchronous (`SceneManager.activate`): the new world is built and its
  shaders compiled with `compileAsync` while the old one stays on screen, then they swap; if
  another world is asked for meanwhile, only the latest request is shown.
- With no world open only the backdrop starfield is drawn, at 30 frames a second. On the low tier
  the interface drops its `backdrop-filter` blur (`:root[data-quality='low']`), which otherwise
  re-blurs the moving scene behind every panel each frame. Starfields draw fewer stars on lower
  tiers by shortening their draw range.
- Only the MediaPipe runtime build the app loads is copied into the deploy
  (`scripts/copy-mediapipe.mjs`); the package's ES-module build is left out, saving 15 MB.
- No post-processing passes. Glow is additive blending on soft point sprites, which costs nothing
  extra and runs on integrated GPUs.
- Pixel ratio is capped by quality tier (1 / 1.5 / 2) and particle budgets scale with it. The tier
  is guessed from device hints (GPU name, cores, memory) and can be fixed in settings.
- In automatic mode `QualityGovernor` (`src/core/engine/QualityGovernor.ts`) adapts from measured
  frame rate. Under 52 fps for 2.5 seconds it steps down, giving up pixel ratio a quarter at a
  time before it gives up a tier. At 57 fps or more for 12 seconds it steps back up, never past
  the starting guess; a climb that has to be undone is retried after 30 seconds, then 60, and so
  on. If two steps down do not raise the frame rate, something else is setting the pace (a 30 Hz
  display, a throttled tab): it undoes them and waits for the frame rate to change. The level it
  settles on is saved with the settings and resumed on the next visit.
- The drawing buffer is multisampled only on displays below 1.5x pixel density. On a 2x display
  multisampling roughly doubled the cost of a frame and the extra pixels already smooth edges.
- Geometries and materials are shared between like objects and tracked per environment; switching
  environments disposes everything the old one allocated.
- One-Euro filtering smooths landmarks adaptively: heavy smoothing when the hand is still, almost
  none when it moves fast, so jitter is removed without adding lag to quick motions.

## State and UI

A single vanilla Zustand store (`src/state/store.ts`) holds screen, active environment, tracking
status, active gestures and persisted settings. The UI is plain TypeScript and CSS that subscribes
to slices of the store. High-frequency data (landmarks for the preview overlay) bypasses the store
and is drawn straight to a canvas.
