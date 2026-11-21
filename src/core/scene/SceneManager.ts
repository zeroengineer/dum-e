import type {
  Environment,
  EnvironmentContext,
  EnvironmentFactory,
  EnvironmentId,
} from './Environment';

/**
 * Registry of environments and owner of the single active one.
 *
 * A world's code may have to be fetched and its shaders compiled before it can be shown, so
 * switching is asynchronous. Until the new world is ready the old one stays on screen; if
 * another world is asked for meanwhile, only the latest request is honoured.
 */
export class SceneManager {
  private readonly factories = new Map<EnvironmentId, EnvironmentFactory>();
  private active: Environment | null = null;
  private request = 0;

  register(id: EnvironmentId, factory: EnvironmentFactory): void {
    this.factories.set(id, factory);
  }

  has(id: EnvironmentId): boolean {
    return this.factories.has(id);
  }

  get current(): Environment | null {
    return this.active;
  }

  /**
   * Shows the requested world, or nothing for `null`.
   *
   * Resolves with the world now on screen, or `undefined` if a later request overtook this one.
   * `prepare` runs after the world is built and before it is shown (compiling its shaders);
   * a failure there is not fatal. Rejects if the world itself cannot be loaded.
   */
  async activate(
    id: EnvironmentId | null,
    ctx: EnvironmentContext,
    prepare?: (environment: Environment) => Promise<void>,
  ): Promise<Environment | null | undefined> {
    const request = ++this.request;
    if (id === null) {
      this.active?.dispose();
      this.active = null;
      return null;
    }
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Unknown environment "${id}"`);

    const environment = await factory();
    if (request !== this.request) return undefined; // never built, nothing to free
    environment.init(ctx);
    if (prepare) {
      try {
        await prepare(environment);
      } catch {
        // The world still works; its first frame may just take longer.
      }
      if (request !== this.request) {
        environment.dispose();
        return undefined;
      }
    }
    this.active?.dispose();
    this.active = environment;
    return environment;
  }

  dispose(): void {
    this.request++;
    this.active?.dispose();
    this.active = null;
    this.factories.clear();
  }
}
