import { defineConfig, devices } from '@playwright/test';

// Not Vite's default preview port, so a preview of another project cannot be mistaken for this app.
const PORT = 4319;

const chromium = {
  ...devices['Desktop Chrome'],
  permissions: ['camera'],
  launchOptions: {
    args: [
      // A synthetic camera feed and no permission prompt.
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      // Software WebGL so the 3D scene renders on machines without a GPU.
      '--enable-unsafe-swiftshader',
    ],
  },
};

// Browser tests run against the production build served by `vite preview`.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: chromium, testIgnore: /camera\.spec\.ts/ },
    // Other engines get the camera-free smoke tests only.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /smoke\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /smoke\.spec\.ts/ },
    // The camera tests load the hand model under software rendering. Sharing the machine with
    // the other tests starves them into timeouts, so they run last, on their own, one at a time.
    {
      name: 'camera',
      use: chromium,
      testMatch: /camera\.spec\.ts/,
      dependencies: ['chromium', 'firefox', 'webkit'],
      fullyParallel: false,
    },
  ],
});
