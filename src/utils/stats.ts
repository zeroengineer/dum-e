/** The last `capacity` samples of a measurement, with the summaries a readout needs. */
export class SampleWindow {
  private readonly values: Float64Array;
  private readonly sorted: Float64Array;
  private count = 0;
  private next = 0;

  constructor(capacity: number) {
    const size = Math.max(1, Math.floor(capacity));
    this.values = new Float64Array(size);
    this.sorted = new Float64Array(size);
  }

  get size(): number {
    return this.count;
  }

  push(value: number): void {
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.values.length;
    if (this.count < this.values.length) this.count++;
  }

  clear(): void {
    this.count = 0;
    this.next = 0;
  }

  mean(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += this.values[i];
    return sum / this.count;
  }

  max(): number {
    let largest = 0;
    for (let i = 0; i < this.count; i++) largest = Math.max(largest, this.values[i]);
    return largest;
  }

  /** Nearest-rank percentile; `p` is 0..1. */
  percentile(p: number): number {
    if (this.count === 0) return 0;
    const sorted = this.sorted.subarray(0, this.count);
    sorted.set(this.values.subarray(0, this.count));
    sorted.sort();
    const rank = Math.ceil(Math.min(1, Math.max(0, p)) * this.count);
    return sorted[Math.max(0, rank - 1)];
  }
}
