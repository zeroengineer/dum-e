/**
 * How a camera image fills a screen of a different shape when it is scaled to cover it
 * (the CSS `object-fit: cover` rule): the fraction of the image left visible along each axis.
 * One of the two is always 1.
 */
export interface CoverFit {
  visibleX: number;
  visibleY: number;
}

/** `imageAspect` and `screenAspect` are width / height. */
export function coverFit(imageAspect: number, screenAspect: number): CoverFit {
  if (!(imageAspect > 0) || !(screenAspect > 0)) return { visibleX: 1, visibleY: 1 };
  return imageAspect > screenAspect
    ? { visibleX: screenAspect / imageAspect, visibleY: 1 }
    : { visibleX: 1, visibleY: imageAspect / screenAspect };
}

/**
 * A point in the image (u right, v down, both 0..1) to normalised device coordinates
 * (-1..1, y up) on a screen the image covers. Points in the cropped part land outside -1..1.
 *
 * The camera background is drawn with the same fit, so a hand position from the tracker lands
 * on the hand in the picture.
 */
export function imageToNdc<T extends { x: number; y: number }>(
  u: number,
  v: number,
  fit: CoverFit,
  out: T,
): T {
  out.x = ((u - 0.5) / fit.visibleX) * 2;
  out.y = ((0.5 - v) / fit.visibleY) * 2;
  return out;
}
