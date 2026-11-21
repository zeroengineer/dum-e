import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LinearFilter,
  Mesh,
  SRGBColorSpace,
  ShaderMaterial,
  Vector2,
  VideoTexture,
} from 'three';
import { coverFit } from '../../core/camera/videoFit';
import type { CoverFit } from '../../core/camera/videoFit';
import { cameraBackdropFragmentShader, cameraBackdropVertexShader } from '../shaders/globe';

const WHOLE: CoverFit = { visibleX: 1, visibleY: 1 };

/**
 * The live camera picture as the back of a scene: mirrored, scaled to cover the screen, and
 * dimmed on request. One draw call, one triangle. The picture stays on this device; it is only
 * ever a texture.
 */
export class CameraBackdrop {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private video: HTMLVideoElement | null = null;
  private texture: VideoTexture | null = null;
  private currentFit: CoverFit = WHOLE;

  constructor() {
    // A single triangle that overhangs the screen covers it without a diagonal seam.
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    const material = new ShaderMaterial({
      vertexShader: cameraBackdropVertexShader,
      fragmentShader: cameraBackdropFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uVideo: { value: null },
        uVisible: { value: new Vector2(1, 1) },
        uDim: { value: 0.35 },
        uTint: { value: new Color('#8fb4ff') },
      },
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    this.mesh.visible = false;
  }

  /** True once there is a picture with known dimensions to show. */
  get live(): boolean {
    return this.mesh.visible;
  }

  /** How the picture currently covers the screen; the whole picture until one is showing. */
  get fit(): CoverFit {
    return this.currentFit;
  }

  setVideo(video: HTMLVideoElement | null): void {
    if (video === this.video) return;
    this.texture?.dispose();
    this.texture = null;
    this.video = video;
    if (video) {
      this.texture = new VideoTexture(video);
      this.texture.colorSpace = SRGBColorSpace;
      this.texture.minFilter = LinearFilter;
      this.texture.magFilter = LinearFilter;
      this.texture.generateMipmaps = false;
    }
    this.mesh.material.uniforms.uVideo.value = this.texture;
    this.mesh.visible = false;
    this.currentFit = WHOLE;
  }

  /** 0 shows the room as it is; towards 1 it goes dark and cool. */
  setDimming(amount: number): void {
    this.mesh.material.uniforms.uDim.value = amount;
  }

  /** Call every frame: the picture's size is only known once the camera has delivered a frame. */
  update(screenAspect: number): void {
    const video = this.video;
    const ready = Boolean(video && video.videoWidth > 0 && video.videoHeight > 0);
    this.mesh.visible = ready;
    if (!video || !ready) {
      this.currentFit = WHOLE;
      return;
    }
    this.currentFit = coverFit(video.videoWidth / video.videoHeight, screenAspect);
    (this.mesh.material.uniforms.uVisible.value as Vector2).set(
      this.currentFit.visibleX,
      this.currentFit.visibleY,
    );
  }

  dispose(): void {
    this.texture?.dispose();
    this.texture = null;
    this.video = null;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
