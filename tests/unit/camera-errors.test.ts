import { describe, expect, it } from 'vitest';
import { cameraSupportProblem, classifyCameraError } from '../../src/vision/webcam/errors';

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'not-found'],
    ['NotReadableError', 'in-use'],
    ['OverconstrainedError', 'constraints'],
    ['AbortError', 'aborted'],
    ['TypeError', 'unsupported'],
    ['SomethingNew', 'unknown'],
  ])('maps %s to %s', (name, kind) => {
    const result = classifyCameraError({ name });
    expect(result.kind).toBe(kind);
    expect(result.message.length).toBeGreaterThan(10);
  });

  it('copes with values that are not errors', () => {
    expect(classifyCameraError(undefined).kind).toBe('unknown');
    expect(classifyCameraError('boom').kind).toBe('unknown');
    expect(classifyCameraError(null).kind).toBe('unknown');
  });

  it('marks a denied or busy camera as worth retrying', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' }).retryable).toBe(true);
    expect(classifyCameraError({ name: 'NotReadableError' }).retryable).toBe(true);
    expect(classifyCameraError({ name: 'TypeError' }).retryable).toBe(false);
  });
});

describe('cameraSupportProblem', () => {
  it('reports an insecure page before anything else', () => {
    expect(cameraSupportProblem({ isSecureContext: false, hasGetUserMedia: false })?.kind).toBe(
      'insecure',
    );
  });

  it('reports a browser without getUserMedia', () => {
    expect(cameraSupportProblem({ isSecureContext: true, hasGetUserMedia: false })?.kind).toBe(
      'unsupported',
    );
  });

  it('returns null when the camera can be requested', () => {
    expect(cameraSupportProblem({ isSecureContext: true, hasGetUserMedia: true })).toBeNull();
  });
});
