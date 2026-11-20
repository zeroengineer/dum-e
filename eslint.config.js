import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Layer boundaries. Each entry lists import patterns a folder must not reach into.
const boundary = (files, patterns, message) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
  },
});

export default tseslint.config(
  { ignores: ['dist', 'public', 'node_modules', 'playwright-report', 'test-results', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  { files: ['scripts/**', '*.config.*'], languageOptions: { globals: { ...globals.node } } },
  boundary(
    ['src/vision/**', 'src/gestures/**'],
    ['three', 'three/*', '**/core/**', '**/environments/**', '**/rendering/**', '**/ui/**'],
    'Vision and gesture code must stay independent of rendering and UI.',
  ),
  boundary(
    ['src/core/**', 'src/environments/**', 'src/rendering/**'],
    ['@mediapipe/*', '**/vision/**', '**/gestures/**', '**/ui/**'],
    'Rendering code receives EnvironmentActions only; it must not touch vision, gestures or UI.',
  ),
  boundary(
    ['src/interaction/**'],
    [
      '@mediapipe/*',
      'three',
      'three/*',
      '**/vision/webcam/**',
      '**/vision/mediapipe/**',
      '**/ui/**',
    ],
    'The interaction layer translates gesture events to actions and nothing else.',
  ),
  prettier,
);
