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
  vision/        webcam, MediaPipe wrapper, landmark processing, tracking service
  gestures/      recognisers, state machine, smoothing filters, event types
  interaction/   gesture event bus, controllers, per-environment mapping tables
  environments/  particles, objects, galaxy
  rendering/     shaders, materials, shared effects
  state/         Zustand store
  ui/            screens, HUD components, controls
  utils/         math, emitter, seeded RNG
  main.ts        composition root
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
2. Register it in `src/gestures/recognizers/index.ts`. Give it a `group` if it must be mutually
   exclusive with other poses, and a `timing` block for its thresholds.
3. Add a row for it to any mapping table in `src/interaction/mappings/` that should react.
4. Add a fixture-based unit test in `tests/unit/`.

## Adding an environment

Implement `Environment` (extend `BaseEnvironment`), register a factory with the `SceneManager`,
add a mapping table, and add an entry to the selector. The UI builds its control panel from
`getControls()`.

## Testing

```bash
npm test            # unit tests
npm run test:e2e    # Playwright (run `npx playwright install` once first)
```

Browser tests start the app with Chromium's fake camera device. Because a fake camera cannot show
a hand, gesture flows are driven by injecting synthetic landmark frames into the pipeline through
the `window.__DUME__` test hook, which is only installed when the URL contains `?e2e=1`. That
covers everything downstream of MediaPipe. Real-hand detection has to be checked by a person at a
webcam; see the checklist in [GESTURE_CONTROLS.md](GESTURE_CONTROLS.md).
