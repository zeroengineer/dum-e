import { describe, expect, it } from 'vitest';
import { coverFit, imageToNdc } from '../../src/core/camera/videoFit';

const ndc = (u: number, v: number, image: number, screen: number): { x: number; y: number } =>
  imageToNdc(u, v, coverFit(image, screen), { x: 0, y: 0 });

describe('coverFit', () => {
  it('shows the whole image when the shapes match', () => {
    expect(coverFit(16 / 9, 16 / 9)).toEqual({ visibleX: 1, visibleY: 1 });
  });

  it('crops top and bottom when the screen is wider than the image', () => {
    const fit = coverFit(4 / 3, 16 / 9);
    expect(fit.visibleX).toBe(1);
    expect(fit.visibleY).toBeCloseTo(0.75);
  });

  it('crops the sides when the screen is taller than the image', () => {
    const fit = coverFit(4 / 3, 3 / 4);
    expect(fit.visibleX).toBeCloseTo(0.5625);
    expect(fit.visibleY).toBe(1);
  });

  it('falls back to showing everything for unusable aspects', () => {
    expect(coverFit(0, 1.5)).toEqual({ visibleX: 1, visibleY: 1 });
    expect(coverFit(Number.NaN, 1.5)).toEqual({ visibleX: 1, visibleY: 1 });
    expect(coverFit(1.5, 0)).toEqual({ visibleX: 1, visibleY: 1 });
  });
});

describe('imageToNdc', () => {
  it('puts the image centre at the screen centre', () => {
    const centre = ndc(0.5, 0.5, 4 / 3, 16 / 9);
    expect(centre.x).toBeCloseTo(0);
    expect(centre.y).toBeCloseTo(0);
  });

  it('maps image corners to screen corners when nothing is cropped', () => {
    expect(ndc(0, 0, 16 / 9, 16 / 9)).toEqual({ x: -1, y: 1 });
    expect(ndc(1, 1, 16 / 9, 16 / 9)).toEqual({ x: 1, y: -1 });
  });

  it('places the edge of the visible band on the screen edge', () => {
    // A 4:3 image on a 16:9 screen shows the middle three quarters of its height.
    expect(ndc(0.5, 0.125, 4 / 3, 16 / 9).y).toBeCloseTo(1);
    expect(ndc(0.5, 0.875, 4 / 3, 16 / 9).y).toBeCloseTo(-1);
    expect(ndc(1, 0.5, 4 / 3, 16 / 9).x).toBeCloseTo(1);
  });

  it('reports cropped parts of the image as off screen', () => {
    expect(ndc(0.5, 0, 4 / 3, 16 / 9).y).toBeGreaterThan(1);
    expect(ndc(0, 0.5, 4 / 3, 3 / 4).x).toBeLessThan(-1);
  });

  it('keeps a hand the same shape on screen: equal image distances stay in proportion', () => {
    const fit = coverFit(4 / 3, 16 / 9);
    const a = imageToNdc(0.5, 0.5, fit, { x: 0, y: 0 });
    const right = imageToNdc(0.6, 0.5, fit, { x: 0, y: 0 });
    const down = imageToNdc(0.5, 0.6, fit, { x: 0, y: 0 });
    // 0.1 of image width is 4/3 as long as 0.1 of image height; on a 16:9 screen NDC x is
    // 16/9 as long as NDC y. Pixels must agree.
    const pixelsX = ((right.x - a.x) / 2) * 16;
    const pixelsY = ((a.y - down.y) / 2) * 9;
    expect(pixelsX / pixelsY).toBeCloseTo(4 / 3);
  });
});
