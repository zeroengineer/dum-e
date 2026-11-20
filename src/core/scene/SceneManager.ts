import type {
  Environment,
  EnvironmentContext,
  EnvironmentFactory,
  EnvironmentId,
} from './Environment';

/** Registry of environments and owner of the single active one. */
export class SceneManager {
  private readonly factories = new Map<EnvironmentId, EnvironmentFactory>();
  private active: Environment | null = null;

  register(id: EnvironmentId, factory: EnvironmentFactory): void {
    this.factories.set(id, factory);
  }

  has(id: EnvironmentId): boolean {
    return this.factories.has(id);
  }

  get current(): Environment | null {
    return this.active;
  }

  /** Disposes the current environment and builds the requested one. */
  activate(id: EnvironmentId | null, ctx: EnvironmentContext): Environment | null {
    if (this.active) {
      this.active.dispose();
      this.active = null;
    }
    if (id === null) return null;
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Unknown environment "${id}"`);
    const environment = factory();
    environment.init(ctx);
    this.active = environment;
    return environment;
  }

  dispose(): void {
    this.active?.dispose();
    this.active = null;
    this.factories.clear();
  }
}
