import { Vector3 } from 'three';
import type { Camera } from 'three';

const origin = new Vector3();
const direction = new Vector3();
const normal = new Vector3();

/**
 * Projects a point given in normalised device coordinates onto the camera-facing plane that
 * passes through `planePoint`. This is how a 2D hand position becomes a 3D position at a chosen depth.
 */
export function ndcToPlane(
  camera: Camera,
  x: number,
  y: number,
  planePoint: Vector3,
  out: Vector3,
): Vector3 {
  camera.updateMatrixWorld();
  origin.setFromMatrixPosition(camera.matrixWorld);
  direction.set(x, y, 0.5).unproject(camera).sub(origin).normalize();
  camera.getWorldDirection(normal);
  const denom = direction.dot(normal);
  if (Math.abs(denom) < 1e-6) return out.copy(planePoint);
  const t = out.copy(planePoint).sub(origin).dot(normal) / denom;
  return out.copy(origin).addScaledVector(direction, t);
}

/** World position to normalised device coordinates. z > 1 means behind the far plane or camera. */
export function worldToNdc(camera: Camera, world: Vector3, out: Vector3): Vector3 {
  return out.copy(world).project(camera);
}
