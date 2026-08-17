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
});
