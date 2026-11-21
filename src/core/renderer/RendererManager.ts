import { ACESFilmicToneMapping, Color, SRGBColorSpace, WebGLRenderer } from 'three';
import type { Camera, Scene } from 'three';
import type { DeviceHints } from '../engine/quality';

export const BACKGROUND_COLOR = 0x04060c;

/** What the last rendered frame cost the GPU to submit. */
export interface RenderStats {
  drawCalls: number;
  points: number;
  triangles: number;
  lines: number;
}

/** Owns the WebGL renderer: creation, sizing, pixel ratio and context loss. */
export class RendererManager {
  readonly renderer: WebGLRenderer;
  readonly maxPointSize: number;
  readonly hints: DeviceHints;
  private width = 1;
  private height = 1;
  private pixelRatioCap = 1.5;
  private contextLost = false;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly resizeListeners = new Set<(aspect: number) => void>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setClearColor(new Color(BACKGROUND_COLOR), 1);

    const gl = this.renderer.getContext();
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
    this.maxPointSize = range ? range[1] : 64;
    this.hints = readDeviceHints(gl);

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);

    this.resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObserver?.observe(canvas);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  get aspect(): number {
    return this.width / this.height;
  }

  get pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  get isContextLost(): boolean {
    return this.contextLost;
  }

  setPixelRatioCap(cap: number): void {
    this.pixelRatioCap = cap;
    this.applySize();
  }

  onResize(listener: (aspect: number) => void): () => void {
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }

  render(scene: Scene, camera: Camera): void {
    if (!this.contextLost) this.renderer.render(scene, camera);
  }

  /** Counts for the most recent `render` call. */
  stats(): RenderStats {
    const { calls, points, triangles, lines } = this.renderer.info.render;
    return { drawCalls: calls, points, triangles, lines };
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.resizeListeners.clear();
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.applySize();
    for (const listener of this.resizeListeners) listener(this.aspect);
  };

  private applySize(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
    this.renderer.setSize(this.width, this.height, false);
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
  };
}

function readDeviceHints(gl: WebGLRenderingContext | WebGL2RenderingContext): DeviceHints {
  const gpu = readGpuName(gl);
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    gpu,
    cores: nav.hardwareConcurrency || 4,
    memory: nav.deviceMemory,
    mobile: /android|iphone|ipad|mobile/i.test(nav.userAgent),
  };
}

function readGpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  } catch {
    return '';
  }
}
