import type { CanonicalTelemetryFrame, MinuteBucket } from '../types/telemetry';

export class SlidingWindowRingBuffer {
  private capacity: number; // Number of 1-minute buckets
  private bucketDurationMs = 60 * 1000;
  // Map of minuteTimestamp -> MinuteBucket
  private buckets: Map<number, MinuteBucket> = new Map();

  constructor(capacityMinutes: number = 15) {
    this.capacity = capacityMinutes;
  }

  private getMinuteStart(timestamp: number): number {
    return Math.floor(timestamp / this.bucketDurationMs) * this.bucketDurationMs;
  }

  public ingest(frame: CanonicalTelemetryFrame): void {
    const minuteStart = this.getMinuteStart(frame.timestamp);
    let bucket = this.buckets.get(minuteStart);

    if (!bucket) {
      bucket = {
        timestamp: minuteStart,
        totalTokens: 0,
        mainTokens: 0,
        subagentTokens: {}
      };
      this.buckets.set(minuteStart, bucket);
    }

    bucket.totalTokens += frame.totalTokens;

    if (frame.subagentId) {
      if (!bucket.subagentTokens[frame.subagentId]) {
        let hash = 0;
        for (let i = 0; i < frame.subagentId.length; i++) {
          hash = (hash << 5) - hash + frame.subagentId.charCodeAt(i);
          hash |= 0;
        }
        const hue = Math.abs((hash * 137.508) % 360);
        const color = `hsl(${hue.toFixed(0)}, 80%, 55%)`;

        bucket.subagentTokens[frame.subagentId] = {
          name: frame.subagentName || frame.subagentId,
          tokens: 0,
          color
        };
      }
      bucket.subagentTokens[frame.subagentId].tokens += frame.totalTokens;
    } else {
      bucket.mainTokens += frame.totalTokens;
    }

    // Prune stale buckets older than 2x capacity to save memory
    const cutoff = minuteStart - (this.capacity * 2 * this.bucketDurationMs);
    for (const [key] of this.buckets) {
      if (key < cutoff) {
        this.buckets.delete(key);
      }
    }
  }

  public getHistory(now: number = Date.now()): MinuteBucket[] {
    const currentMinute = this.getMinuteStart(now);
    const result: MinuteBucket[] = [];

    for (let i = this.capacity - 1; i >= 0; i--) {
      const targetMinute = currentMinute - (i * this.bucketDurationMs);
      const existing = this.buckets.get(targetMinute);

      if (existing) {
        result.push(existing);
      } else {
        result.push({
          timestamp: targetMinute,
          totalTokens: 0,
          mainTokens: 0,
          subagentTokens: {}
        });
      }
    }

    return result;
  }

  public getCurrentRate(now: number = Date.now()): number {
    const currentMinute = this.getMinuteStart(now);
    const bucket = this.buckets.get(currentMinute);
    return bucket ? bucket.totalTokens : 0;
  }

  public getLocalMax(now: number = Date.now()): number {
    const history = this.getHistory(now);
    let max = 0;
    for (const b of history) {
      if (b.totalTokens > max) {
        max = b.totalTokens;
      }
    }
    return max;
  }
}
