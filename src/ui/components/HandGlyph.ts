import { handModel } from '../../utils/handModel';
import type { HandPoint, Pose } from '../../utils/handModel';
import { HAND_CONNECTIONS } from '../../vision/landmarks/types';
import { prefersReducedMotion } from '../dom';
import type { Figure } from '../gestureInfo';

const SVG = 'http://www.w3.org/2000/svg';
const MORPH_MS = 420;
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * A hand drawn the way the tracker sees it: 21 landmarks joined by bones. It morphs between
 * poses, so the same figure serves as the landing illustration and as the tutorial's instructor.
 */
export class HandGlyph {
  readonly element: SVGSVGElement;
  private readonly bones: SVGLineElement[] = [];
  private readonly joints: SVGCircleElement[] = [];
  private points: HandPoint[];
  private from: HandPoint[];
  private to: HandPoint[];
  private morphStart = 0;
  private raf = 0;
  private cycleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(pose: Pose = 'open', mirrored = false) {
    this.points = handModel(pose);
    this.from = this.points;
    this.to = this.points;

    this.element = document.createElementNS(SVG, 'svg');
    this.element.setAttribute('viewBox', '-1.2 -2.15 2.1 2.35');
    this.element.setAttribute('class', 'hand-glyph');
    this.element.setAttribute('aria-hidden', 'true');
    if (mirrored) this.element.style.transform = 'scaleX(-1)';

    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('class', 'hand-glyph__bone');
      this.bones.push(line);
      this.element.append(line);
    }
    for (let i = 0; i < 21; i++) {
      const circle = document.createElementNS(SVG, 'circle');
      circle.setAttribute(
        'class',
        FINGERTIPS.has(i) ? 'hand-glyph__joint hand-glyph__joint--tip' : 'hand-glyph__joint',
      );
      circle.setAttribute('r', FINGERTIPS.has(i) ? '0.062' : '0.042');
      this.joints.push(circle);
      this.element.append(circle);
    }
    this.draw();
  }

  setPose(pose: Pose): void {
    const target = handModel(pose);
    cancelAnimationFrame(this.raf);
    if (prefersReducedMotion()) {
      this.points = target;
      this.draw();
      return;
    }
    this.from = this.points;
    this.to = target;
    this.morphStart = performance.now();
    this.raf = requestAnimationFrame(this.step);
  }

  /** Loops through poses, holding each for `holdMs`. */
  cycle(poses: readonly Pose[], holdMs = 1500): void {
    this.stop();
    if (poses.length === 0) return;
    let index = 0;
    this.setPose(poses[0]);
    if (poses.length === 1 || prefersReducedMotion()) return;
    this.cycleTimer = setInterval(() => {
      index = (index + 1) % poses.length;
      this.setPose(poses[index]);
    }, holdMs);
  }

  stop(): void {
    if (this.cycleTimer !== null) clearInterval(this.cycleTimer);
    this.cycleTimer = null;
    cancelAnimationFrame(this.raf);
  }

  private readonly step = (now: number): void => {
    const t = Math.min(1, (now - this.morphStart) / MORPH_MS);
    const k = ease(t);
    this.points = this.from.map((a, i) => {
      const b = this.to[i];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    });
    this.draw();
    if (t < 1) this.raf = requestAnimationFrame(this.step);
  };

  private draw(): void {
    const p = this.points;
    HAND_CONNECTIONS.forEach(([a, b], i) => {
      const line = this.bones[i];
      line.setAttribute('x1', p[a][0].toFixed(3));
      line.setAttribute('y1', (-p[a][1]).toFixed(3));
      line.setAttribute('x2', p[b][0].toFixed(3));
      line.setAttribute('y2', (-p[b][1]).toFixed(3));
    });
    this.joints.forEach((circle, i) => {
      circle.setAttribute('cx', p[i][0].toFixed(3));
      circle.setAttribute('cy', (-p[i][1]).toFixed(3));
    });
  }
}

/** A figure for any gesture: one posed hand, a hand that sweeps sideways, or two hands spreading. */
export function createFigure(figure: Figure): { element: HTMLElement; dispose(): void } {
  const element = document.createElement('div');
  element.className = `figure figure--${figure.kind}`;
  const glyphs: HandGlyph[] = [];
  if (figure.kind === 'two-hand') {
    glyphs.push(new HandGlyph('open', true), new HandGlyph('open'));
  } else if (figure.kind === 'pose') {
    const glyph = new HandGlyph('relaxed');
    glyph.cycle(['relaxed', figure.pose], 1100);
    glyphs.push(glyph);
  } else {
    glyphs.push(new HandGlyph(figure.kind === 'swipe' ? 'open' : 'relaxed'));
  }
  for (const glyph of glyphs) element.append(glyph.element);
  return { element, dispose: () => glyphs.forEach((glyph) => glyph.stop()) };
}
