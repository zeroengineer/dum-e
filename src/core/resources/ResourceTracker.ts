interface Disposable {
  dispose(): void;
}

/** Remembers GPU-backed resources so an environment can free all of them in one call. */
export class ResourceTracker {
  private readonly resources = new Set<Disposable>();

  track<T extends Disposable>(resource: T): T {
    this.resources.add(resource);
    return resource;
  }

  /** Dispose one resource early (for example a geometry that is being rebuilt). */
  release(resource: Disposable | null | undefined): void {
    if (!resource) return;
    resource.dispose();
    this.resources.delete(resource);
  }

  get size(): number {
    return this.resources.size;
  }

  dispose(): void {
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
  }
}
