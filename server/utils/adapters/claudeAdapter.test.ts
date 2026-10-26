import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeAdapter } from './claudeAdapter';
import type { AgentConfig } from '../../types/telemetry';

describe('ClaudeAdapter', () => {
  let adapter: ClaudeAdapter;
  const mockConfig: AgentConfig = {
    id: 'claude',
    name: 'Claude Code',
    enabled: true,
    parser: 'json-cache',
    path: '~/.claude/stats-cache.json',
    processName: 'claude',
    color: '#a855f7'
  };

  beforeEach(() => {
    adapter = new ClaudeAdapter();
  });

  it('parses stats-cache.json snapshot and returns delta frames on subsequent reads', () => {
    const initialStats = JSON.stringify({
      version: 2,
      modelUsage: {
        'claude-opus-5': {
          inputTokens: 1000,
          outputTokens: 500
        }
      }
    });

    // First read establishes the baseline
    const initialFrames = adapter.parseChunk(initialStats, mockConfig);
    expect(initialFrames.length).toBe(1);
    expect(initialFrames[0].totalTokens).toBe(0); // Baseline delta is 0

    // Second read with incremented tokens
    const updatedStats = JSON.stringify({
      version: 2,
      modelUsage: {
        'claude-opus-5': {
          inputTokens: 1400, // +400 input
          outputTokens: 650  // +150 output
        }
      }
    });

    const deltaFrames = adapter.parseChunk(updatedStats, mockConfig);
    expect(deltaFrames.length).toBe(1);
    expect(deltaFrames[0].inputTokens).toBe(400);
    expect(deltaFrames[0].outputTokens).toBe(150);
    expect(deltaFrames[0].totalTokens).toBe(550);
    expect(deltaFrames[0].agentId).toBe('claude');
  });

  it('handles multiple models within stats-cache.json', () => {
    const baseline = JSON.stringify({
      modelUsage: {
        'claude-opus-5': { inputTokens: 100, outputTokens: 50 },
        'claude-sonnet-5': { inputTokens: 200, outputTokens: 100 }
      }
    });
    adapter.parseChunk(baseline, mockConfig);

    const update = JSON.stringify({
      modelUsage: {
        'claude-opus-5': { inputTokens: 200, outputTokens: 50 }, // +100
        'claude-sonnet-5': { inputTokens: 500, outputTokens: 300 } // +500
      }
    });

    const frames = adapter.parseChunk(update, mockConfig);
    expect(frames.length).toBe(1);
    expect(frames[0].totalTokens).toBe(600); // 100 + 500
  });

  it('resets baseline cleanly if file was truncated/reset', () => {
    const stats1 = JSON.stringify({
      modelUsage: { 'claude-opus-5': { inputTokens: 5000, outputTokens: 2000 } }
    });
    adapter.parseChunk(stats1, mockConfig);

    // File was reset to a lower count (e.g. 35 tokens)
    const statsReset = JSON.stringify({
      modelUsage: { 'claude-opus-5': { inputTokens: 35, outputTokens: 35 } }
    });

    const frames = adapter.parseChunk(statsReset, mockConfig);
    expect(frames.length).toBe(1);
    expect(frames[0].totalTokens).toBe(0); // Should re-anchor baseline without reporting negative tokens
  });

  it('parses Claude Code JSONL session transcripts with usage metrics', () => {
    const jsonlChunk = [
      JSON.stringify({
        type: 'user',
        message: { content: 'hello' },
        timestamp: 1700000000000
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: 'Hello! How can I help you today?',
          usage: {
            input_tokens: 1500,
            output_tokens: 350
          }
        },
        timestamp: 1700000005000
      }),
      JSON.stringify({
        type: 'result',
        usage: {
          input_tokens: 200,
          output_tokens: 50
        },
        timestamp: 1700000010000
      })
    ].join('\n');

    const filePath = '/Users/mac/.claude/projects/my-app/session-abc.jsonl';
    const frames = adapter.parseChunk(jsonlChunk, mockConfig, filePath);

    expect(frames.length).toBe(2);
    expect(frames[0].inputTokens).toBe(1500);
    expect(frames[0].outputTokens).toBe(350);
    expect(frames[0].totalTokens).toBe(1850);
    expect(frames[0].subagentName).toContain('my-app');

    expect(frames[1].inputTokens).toBe(200);
    expect(frames[1].outputTokens).toBe(50);
    expect(frames[1].totalTokens).toBe(250);
  });

  // Equivalence partitioning: valid JSONL usage separates billable cache creation from
  // non-burn cache reads.
  it('includes cache creation but excludes cache reads from JSONL input and total burn', () => {
    const jsonlRecord = JSON.stringify({
      type: 'assistant',
      requestId: 'request-with-cache-tokens',
      message: {
        id: 'message-with-cache-tokens',
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 948,
          cache_read_input_tokens: 81046,
          output_tokens: 204
        }
      },
      timestamp: 1700000020000
    });

    const frames = adapter.parseChunk(
      jsonlRecord,
      mockConfig,
      '/Users/mac/.claude/projects/token-monitor/session-cache.jsonl'
    );

    expect(frames).toEqual([
      expect.objectContaining({
        inputTokens: 950,
        outputTokens: 204,
        totalTokens: 1154
      })
    ]);
  });

  // Error guessing: replayed filesystem events must not double-count an identical request.
  it('emits no duplicate frame when the same logical JSONL request is parsed twice', () => {
    const jsonlRecord = JSON.stringify({
      type: 'assistant',
      requestId: 'request-replayed-by-watcher',
      message: {
        id: 'message-replayed-by-watcher',
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
          output_tokens: 40
        }
      },
      timestamp: 1700000030000
    });
    adapter.parseChunk(jsonlRecord, mockConfig, '/tmp/replayed-session.jsonl');

    const repeatedFrames = adapter.parseChunk(jsonlRecord, mockConfig, '/tmp/replayed-session.jsonl');

    expect(repeatedFrames).toEqual([]);
  });

  // Boundary value and domain analysis: one cumulative field grows while all others stay fixed.
  it('emits only the positive output delta when a cumulative JSONL request later grows', () => {
    adapter.parseChunk(JSON.stringify({
      type: 'assistant',
      requestId: 'request-streaming-output',
      message: {
        id: 'message-streaming-output',
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
          output_tokens: 40
        }
      },
      timestamp: 1700000040000
    }), mockConfig, '/tmp/streaming-session.jsonl');

    const growthFrames = adapter.parseChunk(JSON.stringify({
      type: 'assistant',
      requestId: 'request-streaming-output',
      message: {
        id: 'message-streaming-output',
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
          output_tokens: 45
        }
      },
      timestamp: 1700000045000
    }), mockConfig, '/tmp/streaming-session.jsonl');

    expect(growthFrames).toEqual([
      expect.objectContaining({
        inputTokens: 0,
        outputTokens: 5,
        totalTokens: 5
      })
    ]);
  });

  // Combinatorial testing and error guessing: cumulative growth within a chunk combined with
  // a replayed watcher event must not recount either version of the same logical request.
  it('emits no additional frames when a multi-line cumulative JSONL request sequence is replayed', () => {
    const cumulativeSequence = [
      JSON.stringify({
        type: 'assistant',
        requestId: 'request-sequence-replayed-by-watcher',
        message: {
          id: 'message-sequence-replayed-by-watcher',
          usage: {
            input_tokens: 10,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 30,
            output_tokens: 40
          }
        },
        timestamp: 1700000040000
      }),
      JSON.stringify({
        type: 'assistant',
        requestId: 'request-sequence-replayed-by-watcher',
        message: {
          id: 'message-sequence-replayed-by-watcher',
          usage: {
            input_tokens: 10,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 30,
            output_tokens: 45
          }
        },
        timestamp: 1700000045000
      })
    ].join('\n');
    adapter.parseChunk(cumulativeSequence, mockConfig, '/tmp/replayed-sequence.jsonl');

    const replayedFrames = adapter.parseChunk(
      cumulativeSequence,
      mockConfig,
      '/tmp/replayed-sequence.jsonl'
    );

    expect(replayedFrames).toEqual([]);
  });

  // State-transition analysis: reset moves a previously seen request back to unseen.
  it('recounts an identical JSONL request after reset clears deduplication state', () => {
    const jsonlRecord = JSON.stringify({
      type: 'assistant',
      requestId: 'request-before-reset',
      message: {
        id: 'message-before-reset',
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
          output_tokens: 40
        }
      },
      timestamp: 1700000050000
    });
    adapter.parseChunk(jsonlRecord, mockConfig, '/tmp/reset-session.jsonl');
    adapter.reset();

    const framesAfterReset = adapter.parseChunk(jsonlRecord, mockConfig, '/tmp/reset-session.jsonl');

    expect(framesAfterReset).toEqual([
      expect.objectContaining({
        inputTokens: 30,
        outputTokens: 40,
        totalTokens: 70
      })
    ]);
  });

  // Equivalence partitioning and boundary analysis: billable camelCase counters establish a
  // baseline and advance, while cacheReadInputTokens advances without increasing burn.
  it('includes cache creation but excludes cache reads from stats-cache baseline and delta burn', () => {
    adapter.parseChunk(JSON.stringify({
      version: 2,
      modelUsage: {
        'claude-opus-5': {
          inputTokens: 100,
          cacheCreationInputTokens: 200,
          cacheReadInputTokens: 300,
          outputTokens: 50
        }
      }
    }), mockConfig);

    const deltaFrames = adapter.parseChunk(JSON.stringify({
      version: 2,
      modelUsage: {
        'claude-opus-5': {
          inputTokens: 100,
          cacheCreationInputTokens: 220,
          cacheReadInputTokens: 330,
          outputTokens: 55
        }
      }
    }), mockConfig);

    expect(deltaFrames).toEqual([
      expect.objectContaining({
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 25
      })
    ]);
  });
});
