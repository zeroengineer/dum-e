export type CameraErrorKind =
  | 'denied'
  | 'not-found'
  | 'in-use'
  | 'insecure'
  | 'unsupported'
  | 'constraints'
  | 'aborted'
  | 'unknown';

export interface CameraError {
  kind: CameraErrorKind;
  /** A sentence that can be shown to the user as is. */
  message: string;
  /** True when trying again without changing anything might work. */
  retryable: boolean;
}

const MESSAGES: Record<CameraErrorKind, string> = {
  denied:
    'Camera access was blocked. Allow the camera for this site in your browser’s address bar, then retry.',
  'not-found': 'No camera was found. Connect a webcam, then retry.',
  'in-use':
    'The camera is busy or could not be started. Close other apps or tabs that use it, then retry.',
  insecure: 'Camera access needs a secure page. Open the app over https or on localhost.',
  unsupported: 'This browser does not support camera access.',
  constraints: 'That camera could not provide a usable video mode. Try a different camera.',
  aborted: 'The camera stopped before it could start. Retry.',
  unknown: 'The camera could not be started. Retry.',
};

const KIND_BY_NAME: Record<string, CameraErrorKind> = {
  NotAllowedError: 'denied',
  PermissionDeniedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'not-found',
  DevicesNotFoundError: 'not-found',
  NotReadableError: 'in-use',
  TrackStartError: 'in-use',
  OverconstrainedError: 'constraints',
  ConstraintNotSatisfiedError: 'constraints',
  AbortError: 'aborted',
  TypeError: 'unsupported',
};

export function cameraError(kind: CameraErrorKind): CameraError {
  return {
    kind,
    message: MESSAGES[kind],
    retryable: kind !== 'unsupported' && kind !== 'insecure',
  };
}

/** Turns whatever getUserMedia rejected with into something the UI can explain. */
export function classifyCameraError(error: unknown): CameraError {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';
  return cameraError(KIND_BY_NAME[name] ?? 'unknown');
}

/** Why the camera cannot even be requested in this context, or null if it can. */
export function cameraSupportProblem(env: {
  isSecureContext: boolean;
  hasGetUserMedia: boolean;
}): CameraError | null {
  if (!env.isSecureContext) return cameraError('insecure');
  if (!env.hasGetUserMedia) return cameraError('unsupported');
  return null;
}
