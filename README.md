# DUM-E

Four 3D environments in the browser that you control with your hands. A webcam and
MediaPipe's Hand Landmarker track up to two hands; a custom gesture engine turns the landmarks
into gestures; Three.js renders the result. Nothing leaves your machine: there is no backend and
the video is never recorded or uploaded.

| Environment             | What you do there                                           |
| ----------------------- | ----------------------------------------------------------- |
| Particle Universe       | Push, pull, grab and reshape tens of thousands of particles |
| Object Manipulation Lab | Point at, grab, move, rotate and scale geometric objects    |
| Galaxy Explorer         | Spin, stretch and fly around a procedural spiral galaxy     |
| Holo Globe              | Hold a hologram of the Earth in your hand, on camera        |

Mouse and keyboard work everywhere as a fallback, so the app is usable without a camera.

## Using it

1. **Start experience** asks for the camera and takes you to the world list. **Continue with mouse
   only** skips the camera.
2. Pick a world. The first time, a short tutorial teaches each gesture and moves on when it sees
   you make it.
3. In a world: the top bar switches worlds and shows tracking status; Gestures lists what each
   gesture does there; Controls has a slider or button for everything; the corner shows the
   camera with your tracked hand drawn on it.

`?env=particles`, `?env=objects`, `?env=galaxy` or `?env=globe` in the URL opens a world directly.

## Quick start

```bash
npm install     # also copies the MediaPipe runtime and model into public/mediapipe
npm run dev     # http://localhost:5173
```

Requirements: Node 20.19+ or 22.12+, a browser with WebGL 2 and `getUserMedia` (current Chrome,
Edge, Firefox or Safari), and a webcam for gesture control. Camera access needs a secure context:
`localhost` or HTTPS.

## Scripts

| Script              | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Dev server with hot reload                 |
| `npm run build`     | Type-check and build to `dist/`            |
| `npm run preview`   | Serve the production build                 |
| `npm run typecheck` | `tsc --noEmit`                             |
| `npm run lint`      | ESLint, including the layer-boundary rules |
| `npm run format`    | Prettier                                   |
| `npm test`          | Unit tests (Vitest)                        |
| `npm run test:e2e`  | Browser tests (Playwright)                 |

## Camera requirements

- Any webcam at 640×480 or better. The app asks for 640×480 on purpose: hand tracking does not
  benefit from more pixels and lower resolution keeps inference fast.
- Even front lighting, hands 40–80 cm from the camera, and a background that is not skin-toned
  give the steadiest tracking.
- If permission is denied the app explains how to re-enable it, offers Retry, and stays usable
  with mouse and keyboard.
- The camera stream is stopped when you turn the camera off and when you leave the page.

The hand model and MediaPipe runtime are served by the app itself. The two interface typefaces
load from Google Fonts; offline, the interface falls back to system fonts.

## Documentation

- [GESTURE_CONTROLS.md](GESTURE_CONTROLS.md): every gesture and its mouse/keyboard equivalent
- [ARCHITECTURE.md](ARCHITECTURE.md): the systems, the event pipeline and the performance decisions
- [DEVELOPMENT.md](DEVELOPMENT.md): setup, conventions, Git workflow, testing, adding gestures

## Stack

TypeScript, Vite, Three.js, MediaPipe Tasks Vision, Zustand (vanilla store), plain HTML and CSS.
Vitest and Playwright for tests, ESLint and Prettier for hygiene.
