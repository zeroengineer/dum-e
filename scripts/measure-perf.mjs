// Measures how fast each world really renders, with the display's refresh cap removed, so
// changes can be compared on a machine that normally sits at 60 fps.
//
//   npm run build && node scripts/measure-perf.mjs [--dpr 2] [--size 1440x810] [--quality high]
//                              [--worlds particles,objects,galaxy,globe] [--aa 0|1] [--label text]
//
// It serves dist/ with `vite preview`, opens each world in Chromium on the real GPU with vsync
// off and waits for the GPU at the end of every frame, so the frame time printed is the cost of
// drawing one frame, CPU and GPU together. 16.7 ms is the budget for 60 frames a second; the
// further below it, the more headroom a slower machine has.
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((arg, i, all) => (arg.startsWith('--') ? [arg.slice(2), all[i + 1]] : null))
    .filter(Boolean),
);
const dpr = Number(args.dpr ?? 2);
const [width, height] = (args.size ?? '1440x810').split('x').map(Number);
const quality = args.quality ?? 'high';
const worlds = (args.worlds ?? 'particles,objects,galaxy,globe').split(',');
const aa = args.aa === undefined ? '' : `&aa=${args.aa}`;
const port = 4327;

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
});
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('vite preview did not start; run `npm run build` first');
}

await waitForServer();
const browser = await chromium.launch({
  args: [
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--enable-gpu',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
  ],
});
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: dpr,
});
await context.addInitScript((q) => {
  localStorage.setItem('dum-e:settings:v1', JSON.stringify({ tutorialSeen: true, quality: q }));
}, quality);

const rows = [];
let gpu = 'unknown';
for (const world of worlds) {
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/?e2e=1&env=${world}${aa}`);
  await page.waitForFunction(() => window.__DUME__?.perf() != null);
  await page.waitForTimeout(1500); // let the world finish opening
  await page.evaluate(() => window.__DUME__.gpuSync(true));
  await page.waitForFunction(() => window.__DUME__?.perf() != null);
  await page.waitForTimeout(3000);
  const result = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      perf: window.__DUME__.perf(),
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
      stalls: performance
        .getEntriesByType('measure')
        .map((entry) => `${entry.name.replace('dum-e:', '')} ${entry.duration.toFixed(1)}`),
    };
  });
  gpu = result.gpu;
  const p = result.perf;
  rows.push({
    world,
    'frame ms (mean)': p.workMean.toFixed(2),
    'frame ms (p95)': p.workP95.toFixed(2),
    calls: p.drawCalls,
    'pixel ratio': p.pixelRatio,
    antialias: p.antialias,
    tier: p.quality,
    stalls: result.stalls.join(', '),
  });
  await page.close();
}
await browser.close();
stop();

console.log(`GPU: ${gpu}`);
console.log(
  `${args.label ? `${args.label}: ` : ''}viewport ${width}x${height} at device pixel ratio ${dpr}, quality ${quality}`,
);
console.table(rows);
