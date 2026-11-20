import { HAND_CONNECTIONS } from '../../vision/landmarks/types';
import type { TrackingFrame } from '../../vision/landmarks/types';
import { h } from '../dom';

const HAND_COLOR = '#ffb454';
const BONE_COLOR = 'rgba(255, 180, 84, 0.75)';

/**
 * The mirrored camera picture with the tracked landmarks drawn over it. Landmarks arrive at
 * tracking rate and are painted straight to a canvas, never through the store.
 */
export class WebcamPreview {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private visible = true;

  constructor(video: HTMLVideoElement) {
    video.classList.add('preview__video');
    this.canvas = h('canvas', { class: 'preview__overlay', width: 320, height: 240 });
    this.ctx = this.canvas.getContext('2d');
    this.element = h(
      'div',
      {
        class: 'preview',
        attrs: { role: 'img', 'aria-label': 'Camera preview with tracked hands' },
      },
      video,
      this.canvas,
    );
  }

  /** Hides the picture without stopping the video, which tracking still needs. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.element.classList.toggle('preview--hidden', !visible);
    if (!visible) this.clear();
  }

  clear(): void {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(frame: TrackingFrame): void {
    const ctx = this.ctx;
    if (!ctx || !this.visible) return;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    for (const hand of frame.hands) {
      // Landmarks are already mirrored, matching the mirrored video underneath.
      const p = hand.landmarks;
      ctx.strokeStyle = BONE_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(p[a].x * width, p[a].y * height);
        ctx.lineTo(p[b].x * width, p[b].y * height);
      }
      ctx.stroke();
      ctx.fillStyle = HAND_COLOR;
      for (const point of p) {
        ctx.beginPath();
        ctx.arc(point.x * width, point.y * height, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
