/**
 * A Set with a maximum size.
 *
 * Useful for de-duplication in polling loops (e.g. "have we seen this comment ID already?")
 * while preventing unbounded memory growth.
 *
 * Eviction policy: oldest *insertion* wins (not a true LRU).
 */
export class FixedSizeSet<T> {
  private readonly set = new Set<T>();
  private readonly order: T[] = [];

  constructor(private readonly maxSize: number) {
    if (!Number.isFinite(maxSize) || maxSize <= 0) {
      throw new Error(`Invalid maxSize: ${maxSize}`);
    }
  }

  public has(value: T): boolean {
    return this.set.has(value);
  }

  public add(value: T): void {
    if (this.set.has(value)) return;
    this.set.add(value);
    this.order.push(value);

    while (this.order.length > this.maxSize) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.set.delete(oldest);
    }
  }
}
