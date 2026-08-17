import { describe, it, expect, beforeEach } from 'vitest';
import { SlidingWindowRingBuffer } from './ringBuffer';

describe('SlidingWindowRingBuffer', () => {
  let buffer: SlidingWindowRingBuffer;
  const fixedCapacity = 15; // 15 minutes

  beforeEach(() => {
    buffer = new SlidingWindowRingBuffer(fixedCapacity);
  });

  it('initializes with fixed number of empty minute buckets', () => {
    const now = 1755331200000; // Fixed timestamp (e.g. 10:00:00 UTC)
    const history = buffer.getHistory(now);
    expect(history.length).toBe(15);
    expect(history[14].totalTokens).toBe(0);
    expect(buffer.getLocalMax(now)).toBe(0);
    expect(buffer.getCurrentRate(now)).toBe(0);
  });

  it('aggregates tokens ingested in the same minute', () => {
    const baseTime = 1755331200000; // 10:00:00
    buffer.ingest({
      agentId: 'claude',
      agentName: 'Claude Code',
      timestamp: baseTime + 10000, // 10:00:10
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      status: 'active'
    });

    buffer.ingest({
      agentId: 'claude',
      agentName: 'Claude Code',
      timestamp: baseTime + 25000, // 10:00:25
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      status: 'active'
    });

    const history = buffer.getHistory(baseTime + 30000);
    const latestBucket = history[history.length - 1];
    expect(latestBucket.totalTokens).toBe(450);
    expect(buffer.getCurrentRate(baseTime + 30000)).toBe(450);
    expect(buffer.getLocalMax(baseTime + 30000)).toBe(450);
  });

  it('advances window across multiple minutes and rolls off older buckets', () => {
    const baseTime = 1755331200000; // 10:00:00

    // Ingest 500 tokens at 10:00
    buffer.ingest({
      agentId: 'claude',
      agentName: 'Claude Code',
      timestamp: baseTime,
      inputTokens: 500,
      outputTokens: 0,
      totalTokens: 500,
      status: 'active'
    });

    // Ingest 1200 tokens at 10:05 (5 minutes later)
    const timeAt5m = baseTime + 5 * 60 * 1000;
    buffer.ingest({
      agentId: 'claude',
      agentName: 'Claude Code',
      timestamp: timeAt5m,
      inputTokens: 1200,
      outputTokens: 0,
      totalTokens: 1200,
      status: 'active'
    });

    expect(buffer.getCurrentRate(timeAt5m)).toBe(1200);
    expect(buffer.getLocalMax(timeAt5m)).toBe(1200);

    // Ingest at 10:19 (14 minutes after 10:05 - still within 15m window)
    const timeAt19m = baseTime + 19 * 60 * 1000;
    buffer.ingest({
      agentId: 'claude',
      agentName: 'Claude Code',
      timestamp: timeAt19m,
      inputTokens: 300,
      outputTokens: 0,
      totalTokens: 300,
      status: 'active'
    });

    const historyAt19m = buffer.getHistory(timeAt19m);
    expect(historyAt19m.length).toBe(15);
    expect(buffer.getCurrentRate(timeAt19m)).toBe(300);
    // 10:05 bucket (1200) is still within last 15 minutes (10:05 to 10:19)
    expect(buffer.getLocalMax(timeAt19m)).toBe(1200);

    // Fast forward to 10:35 (16 minutes after 10:19 - all previous buckets rolled off)
    const timeAt35m = baseTime + 35 * 60 * 1000;
    expect(buffer.getLocalMax(timeAt35m)).toBe(0);
  });

  it('tracks subagent token breakdown inside minute buckets', () => {
    const baseTime = 1755331200000;

    buffer.ingest({
      agentId: 'antigravity',
      agentName: 'Antigravity',
      subagentId: 'sub-research',
      subagentName: 'Codebase Researcher',
      timestamp: baseTime + 5000,
      inputTokens: 1000,
      outputTokens: 200,
      totalTokens: 1200,
      status: 'active'
    });

    const history = buffer.getHistory(baseTime + 10000);
    const latestBucket = history[history.length - 1];
    expect(latestBucket.totalTokens).toBe(1200);
    expect(latestBucket.subagentTokens['sub-research']).toBeDefined();
    expect(latestBucket.subagentTokens['sub-research'].tokens).toBe(1200);
    expect(latestBucket.subagentTokens['sub-research'].name).toBe('Codebase Researcher');
  });
});
