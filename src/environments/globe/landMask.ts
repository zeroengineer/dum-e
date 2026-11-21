import { LAND_MASK_BASE64, LAND_MASK_HEIGHT, LAND_MASK_WIDTH } from './landMaskData';

let bits: Uint8Array | null = null;

function decode(): Uint8Array {
  const binary = atob(LAND_MASK_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** True where the Earth is land, to the nearest degree. Latitude -90..90, any longitude. */
export function isLand(latitude: number, longitude: number): boolean {
  bits ??= decode();
  const row = Math.min(
    LAND_MASK_HEIGHT - 1,
    Math.max(0, Math.floor(((90 - latitude) / 180) * LAND_MASK_HEIGHT)),
  );
  const wrapped = (((longitude + 180) % 360) + 360) % 360;
  const col = Math.min(LAND_MASK_WIDTH - 1, Math.floor((wrapped / 360) * LAND_MASK_WIDTH));
  const index = row * LAND_MASK_WIDTH + col;
  return (bits[index >> 3] & (1 << (index & 7))) !== 0;
}
