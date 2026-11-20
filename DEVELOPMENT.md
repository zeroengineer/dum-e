# Development

## Setup

```bash
npm install
npm run dev
```

`npm install` runs `scripts/copy-mediapipe.mjs`, which copies the MediaPipe wasm runtime from
`node_modules` to `public/mediapipe/wasm` and downloads `hand_landmarker.task` next to it. Both are
gitignored. `npm run dev` and `npm run build` repeat the step if the files are missing. If the
model download fails (offline install), the app loads the model from Google's CDN at runtime.

## Project layout

```
src/
  core/          engine loop, renderer, scene management, camera rig, resource tracking
  app/           composition root (App), the camera-to-gesture TrackingSession, test hook
  vision/        webcam, MediaPipe wrapper, landmark processing, tracking loop
  gestures/      finger classifier, recognisers, state machine, engine, smoothing, event types
  interaction/   gesture event bus, controller, mouse/keyboard fallback, mapping tables
  environments/  particles, objects, galaxy
  rendering/     shaders, materials, shared effects
  state/         Zustand store
  ui/            screens, HUD components, controls
  utils/         math, emitter, seeded RNG, parametric hand model
  main.ts        entry point
tests/
  unit/          Vitest
  e2e/           Playwright
```

Layer boundaries are lint rules. If ESLint reports a restricted import, the fix is to pass data
through the pipeline, not to relax the rule.

## Conventions

- TypeScript strict mode. Type-only imports use `import type`.
- Recognisers, formation generators, mappings and filters are pure and unit-testable without a DOM.
- Three.js objects are created through an environment's `ResourceTracker` so they get disposed.
- No per-frame allocations in `update` paths; reuse vectors.

## Git workflow

- `main` always builds. Every feature is developed on its own `feature/<name>` branch, pushed, and
  merged into `main` with a merge commit (`--no-ff`).
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `perf:`.
- No force pushes. No secrets, recordings, `node_modules` or build output in the repository.

## Adding a gesture

1. Write a recogniser in `src/gestures/recognizers/` implementing `HandRecognizer` or
   `TwoHandRecognizer`. Return a confidence between 0 and 1; do not keep state.
2. Register it in `createDefaultRegistry()` in `src/gestures/recognizers/GestureRegistry.ts`. Give it a `group` if it must be mutually
   exclusive with other poses, and a `timing` block for its thresholds.
3. Add a row for it to any mapping table in `src/interaction/mappings/index.ts` that should react.
4. Add its label and instructions to `src/ui/gestureInfo.ts` so the HUD can name it.
5. Add a unit test in `tests/unit/`; `tests/unit/helpers/hands.ts` builds synthetic hands in any pose.

## Adding an environment

Implement `Environment` (extend `BaseEnvironment`), add it to `src/environments/index.ts`, add a
mapping table to `DEFAULT_MAPPINGS`, and add its rows to `GESTURE_GUIDE` in `src/ui/gestureInfo.ts`.
The selector, tabs and control panel are generated from those; the panel comes from `getControls()`.

## Testing

```bash
npm test            # unit tests
npm run test:e2e    # Playwright (run `npx playwright install` once first)
```

Browser tests build the app, serve it with `vite preview` and start Chromium with a fake camera
device. Because a fake camera cannot show a hand, gesture flows are driven by injecting synthetic
landmark frames ahead of the landmark processor through the `window.__DUME__` test hook
(`src/app/testHook.ts`), which is only installed when the URL contains `?e2e=1`. That covers
everything downstream of MediaPipe. Real-hand detection has to be checked by a person at a
webcam; see the checklist in [GESTURE_CONTROLS.md](GESTURE_CONTROLS.md).
