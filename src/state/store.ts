import { createStore } from 'zustand/vanilla';
import type { EnvironmentId, QualityLevel } from '../core/scene/Environment';
import type { GestureHand, GestureName } from '../gestures/events/types';

export type Screen = 'landing' | 'selector' | 'experience';

export type TrackingStatus =
  | 'off'
  | 'requesting' // waiting for the camera permission prompt
  | 'loading' // camera is live, model is loading
  | 'active'
  | 'paused' // tab hidden
  | 'denied'
  | 'error';

export interface Settings {
  cameraId: string | null;
  /** 0..1. Higher recognises gestures more eagerly. */
  sensitivity: number;
  /** Hand detection rate in Hz. */
  trackingHz: number;
  /** 0 means "use the quality default". */
  particleCount: number;
  quality: 'auto' | QualityLevel;
  showPreview: boolean;
  /** Mouse and keyboard act as a virtual hand. */
  fallbackInput: boolean;
  tutorialSeen: boolean;
}

export interface ActiveGesture {
  gesture: GestureName;
  hand: GestureHand;
  confidence: number;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface AppState {
  screen: Screen;
  environment: EnvironmentId | null;
  tracking: {
    status: TrackingStatus;
    message: string | null;
    hands: GestureHand[];
    /** Detections per second actually achieved. */
    rate: number;
  };
  gestures: ActiveGesture[];
  /** Most recent discrete gesture (swipe), for a transient HUD flash. */
  lastGesture: { gesture: GestureName; hand: GestureHand; detail?: string; at: number } | null;
  devices: CameraDevice[];
  settings: Settings;
  resolvedQuality: QualityLevel;
  fps: number;
  settingsOpen: boolean;
  tutorialOpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  cameraId: null,
  sensitivity: 0.5,
  trackingHz: 24,
  particleCount: 0,
  quality: 'auto',
  showPreview: true,
  fallbackInput: true,
  tutorialSeen: false,
};

const STORAGE_KEY = 'dum-e:settings:v1';

export function loadSettings(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...(parsed as Partial<Settings>) });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function sanitizeSettings(s: Settings): Settings {
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  const qualities = ['auto', 'low', 'medium', 'high'];
  return {
    cameraId: typeof s.cameraId === 'string' ? s.cameraId : null,
    sensitivity: num(s.sensitivity, 0, 1, DEFAULT_SETTINGS.sensitivity),
    trackingHz: num(s.trackingHz, 10, 30, DEFAULT_SETTINGS.trackingHz),
    particleCount: num(s.particleCount, 0, 120_000, 0),
    quality: qualities.includes(s.quality) ? s.quality : 'auto',
    showPreview: s.showPreview !== false,
    fallbackInput: s.fallbackInput !== false,
    tutorialSeen: s.tutorialSeen === true,
  };
}

function saveSettings(settings: Settings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); settings then last for the session only.
  }
}

export const store = createStore<AppState>(() => ({
  screen: 'landing',
  environment: null,
  tracking: { status: 'off', message: null, hands: [], rate: 0 },
  gestures: [],
  lastGesture: null,
  devices: [],
  settings: loadSettings(),
  resolvedQuality: 'medium',
  fps: 0,
  settingsOpen: false,
  tutorialOpen: false,
}));

export function updateSettings(patch: Partial<Settings>): void {
  const settings = sanitizeSettings({ ...store.getState().settings, ...patch });
  store.setState({ settings });
  saveSettings(settings);
}

export function setTracking(patch: Partial<AppState['tracking']>): void {
  store.setState((s) => ({ tracking: { ...s.tracking, ...patch } }));
}

/** Subscribe to one slice of state; the listener runs only when that slice changes. */
export function watch<T>(
  selector: (state: AppState) => T,
  listener: (value: T, previous: T) => void,
  equals: (a: T, b: T) => boolean = Object.is,
): () => void {
  let current = selector(store.getState());
  return store.subscribe((state) => {
    const next = selector(state);
    if (!equals(current, next)) {
      const previous = current;
      current = next;
      listener(next, previous);
    }
  });
}
