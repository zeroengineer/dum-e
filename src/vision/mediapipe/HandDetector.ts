import type { HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { HandId, RawHand } from '../landmarks/types';

export type DetectorDelegate = 'GPU' | 'CPU';

export interface HandDetector {
  readonly delegate: DetectorDelegate;
  /** Where the model was loaded from. */
  readonly modelUrl: string;
  /** Runs inference on the current video frame. `timestampMs` must increase on every call. */
  detect(video: HTMLVideoElement, timestampMs: number): RawHand[];
  close(): void;
}

export interface HandDetectorOptions {
  maxHands: number;
  minDetectionConfidence: number;
  minPresenceConfidence: number;
  minTrackingConfidence: number;
  /** Folder that holds the MediaPipe wasm runtime. */
  wasmBase: string;
  /** Tried in order; the first model that loads wins. */
  modelUrls: string[];
}

/** Served by this app (copied by scripts/copy-mediapipe.mjs). */
export const LOCAL_MODEL_PATH = 'mediapipe/hand_landmarker.task';
/** Fallback when the local copy is missing. Pinned to a specific model version. */
export const CDN_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export function defaultDetectorOptions(baseUrl: string): HandDetectorOptions {
  return {
    maxHands: 2,
    minDetectionConfidence: 0.6,
    minPresenceConfidence: 0.6,
    minTrackingConfidence: 0.55,
    wasmBase: new URL('mediapipe/wasm', baseUrl).href,
    modelUrls: [new URL(LOCAL_MODEL_PATH, baseUrl).href, CDN_MODEL_URL],
  };
}

/** Converts MediaPipe's result into the detector-agnostic RawHand shape. */
export function toRawHands(result: HandLandmarkerResult): RawHand[] {
  const hands: RawHand[] = [];
  const count = result.landmarks?.length ?? 0;
  for (let i = 0; i < count; i++) {
    const landmarks = result.landmarks[i];
    if (!landmarks || landmarks.length < 21) continue;
    const category = result.handedness?.[i]?.[0];
    const handedness: HandId = category?.categoryName === 'Left' ? 'Left' : 'Right';
    hands.push({
      landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      worldLandmarks: result.worldLandmarks?.[i]?.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      handedness,
      score: category?.score ?? 0,
    });
  }
  return hands;
}

/** A dev server answers unknown paths with index.html, so "200 OK" alone does not prove the model is there. */
async function modelIsReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const type = response.headers.get('content-type') ?? '';
    return response.ok && !type.includes('text/html');
  } catch {
    return false;
  }
}

/**
 * Loads the MediaPipe Hand Landmarker. The library is imported lazily so the wasm runtime and
 * model are only downloaded when the user actually turns the camera on. Prefers the GPU delegate
 * and falls back to CPU, and prefers the locally served model over the CDN.
 */
export async function createHandDetector(options: HandDetectorOptions): Promise<HandDetector> {
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(options.wasmBase);

  let lastError: unknown = new Error('No hand landmarker model could be loaded.');
  for (const modelUrl of options.modelUrls) {
    if (!(await modelIsReachable(modelUrl))) continue;
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        const landmarker: HandLandmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate },
          runningMode: 'VIDEO',
          numHands: options.maxHands,
          minHandDetectionConfidence: options.minDetectionConfidence,
          minHandPresenceConfidence: options.minPresenceConfidence,
          minTrackingConfidence: options.minTrackingConfidence,
        });
        return {
          delegate,
          modelUrl,
          detect: (video, timestampMs) => toRawHands(landmarker.detectForVideo(video, timestampMs)),
          close: () => landmarker.close(),
        };
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
