// Copies the MediaPipe wasm runtime out of node_modules into public/mediapipe so the app
// serves it itself, and tries to cache the hand landmarker model next to it.
// Both outputs are gitignored. If the model download fails the app falls back to the CDN URL.
import { access, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const outDir = join(root, 'public/mediapipe');
const modelPath = join(outDir, 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );

if (!(await exists(wasmSrc))) {
  console.warn('[copy-mediapipe] @mediapipe/tasks-vision is not installed yet, skipping.');
  process.exit(0);
}

// The package ships two builds of the runtime. `FilesetResolver.forVisionTasks(base)`, as the
// app calls it, loads the plain one; the `_module_` build is for ES-module loading, which the
// app does not use. Shipping both doubled the deploy by 15 MB for nothing.
const RUNTIME = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
const UNUSED = ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm'];

const force = process.argv.includes('--force');
const wasmOut = join(outDir, 'wasm');
if (force || !(await exists(join(wasmOut, 'vision_wasm_internal.wasm')))) {
  await mkdir(wasmOut, { recursive: true });
  for (const file of RUNTIME) await copyFile(join(wasmSrc, file), join(wasmOut, file));
  console.log('[copy-mediapipe] wasm runtime copied to public/mediapipe/wasm');
}
// Clear out copies made before this script stopped shipping the unused build.
for (const file of UNUSED) await rm(join(wasmOut, file), { force: true });

if (!(await exists(modelPath))) {
  try {
    const res = await fetch(MODEL_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log('[copy-mediapipe] hand landmarker model cached in public/mediapipe');
  } catch (err) {
    console.warn(
      `[copy-mediapipe] could not download the model (${err.message}); the app will load it from the CDN at runtime.`,
    );
  }
}
