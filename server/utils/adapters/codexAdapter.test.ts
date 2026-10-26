import { beforeEach, describe, expect, it } from 'vitest';
import { CodexAdapter } from './codexAdapter';
import type { AgentConfig } from '../../types/telemetry';

describe('CodexAdapter fresh-token telemetry', () => {
  let adapter: CodexAdapter;
  const config: AgentConfig = {
    id: 'codegpt',
    name: 'Codegpt',
    enabled: true,
    parser: 'sqlite-db',
    path: '~/.codex',
    processName: 'codegpt',
    color: '#f97316'
  };

  beforeEach(() => {
    adapter = new CodexAdapter();
  });

  // Equivalence partitioning: cached input belongs to the valid-but-not-fresh class.
  it('emits only uncached input plus output for the first event in a new runtime rollout', () => {
    const frames = adapter.parseChunk(JSON.stringify({
      timestamp: '2026-08-20T07:02:02.963Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 25528,
            cached_input_tokens: 5888,
            output_tokens: 217,
            total_tokens: 25745
          }
        }
      }
    }), config, '/Users/mac/.codex/sessions/2026/08/20/rollout-2026-08-20T00-02-02-01a01dfa-0e67-7283-a52e-acf0e3fd8c9b.jsonl');

    expect(frames).toEqual([{
      agentId: 'codegpt',
      agentName: 'Codegpt',
      subagentId: 'thread-01a01dfa',
      subagentName: 'thread-01a01dfa',
      timestamp: 1787209322963,
      inputTokens: 19640,
      outputTokens: 217,
      totalTokens: 19857,
      status: 'active'
    }]);
  });

  // Boundary value analysis: exact equality produces the zero boundary and no new frame.
  it('emits no frame for an exact repeat of a cumulative token snapshot', () => {
    const record = JSON.stringify({
      timestamp: '2026-08-20T07:02:02.963Z',
      type: 'event_msg',
      payload: { type: 'token_count', info: { total_token_usage: {
        input_tokens: 25528, cached_input_tokens: 5888, output_tokens: 217, total_tokens: 25745
      } } }
    });
    adapter.parseChunk(record, config, '/tmp/rollout-01a01dfa-0e67-7283-a52e-acf0e3fd8c9b.jsonl');

    const frames = adapter.parseChunk(record, config, '/tmp/rollout-01a01dfa-0e67-7283-a52e-acf0e3fd8c9b.jsonl');

    expect(frames).toEqual([]);
  });

  // Domain analysis: input and cache are coupled; only their difference is fresh input.
  it('emits component deltas between monotone cumulative snapshots', () => {
    adapter.parseChunk(JSON.stringify({
      timestamp: '2026-08-20T07:02:02.963Z', type: 'event_msg', payload: {
        type: 'token_count', info: { total_token_usage: {
          input_tokens: 1000, cached_input_tokens: 800, output_tokens: 100, total_tokens: 1100
        } }
      }
    }), config, '/tmp/rollout-aaaaaaaa-1111-2222-3333-444444444444.jsonl');

    const frames = adapter.parseChunk(JSON.stringify({
      timestamp: '2026-08-20T07:03:00.000Z', type: 'event_msg', payload: {
        type: 'token_count', info: { total_token_usage: {
          input_tokens: 1500, cached_input_tokens: 1200, output_tokens: 140, total_tokens: 1640
        } }
      }
    }), config, '/tmp/rollout-aaaaaaaa-1111-2222-3333-444444444444.jsonl');

    expect(frames).toEqual([
      expect.objectContaining({ inputTokens: 100, outputTokens: 40, totalTokens: 140 })
    ]);
  });

  // Boundary value and error guessing: cached input may exceed input in malformed producer data.
  it('clamps negative fresh input to zero without discarding positive output', () => {
    const frames = adapter.parseChunk(JSON.stringify({
      timestamp: '2026-08-20T07:02:02.963Z', type: 'event_msg', payload: {
        type: 'token_count', info: { total_token_usage: {
          input_tokens: 99, cached_input_tokens: 100, output_tokens: 1, total_tokens: 100
        } }
      }
    }), config, '/tmp/rollout-bbbbbbbb-1111-2222-3333-444444444444.jsonl');

    expect(frames).toEqual([
      expect.objectContaining({ inputTokens: 0, outputTokens: 1, totalTokens: 1 })
    ]);
  });

  // Error guessing: a component reset is a new baseline, never a negative or partial delta.
  it('reanchors without a frame when one cumulative component regresses', () => {
    adapter.parseChunk(JSON.stringify({
      timestamp: '2026-08-20T07:02:02.963Z', type: 'event_msg', payload: {
        type: 'token_count', info: { total_token_usage: {
          input_tokens: 1000, cached_input_tokens: 800, output_tokens: 100, total_tokens: 1100
        } }
      }
    }), config, '/tmp/rollout-cccccccc-1111-2222-3333-444444444444.jsonl');

    const frames = adapter.parseChunk(JSON.stringify({
      timestamp: '2026-08-20T07:03:02.963Z', type: 'event_msg', payload: {
        type: 'token_count', info: { total_token_usage: {
          input_tokens: 1100, cached_input_tokens: 900, output_tokens: 90, total_tokens: 1190
        } }
      }
    }), config, '/tmp/rollout-cccccccc-1111-2222-3333-444444444444.jsonl');

    expect(frames).toEqual([]);
  });

  // Combinatorial testing: file identity and cumulative state must not leak across rollouts.
  it('tracks identical cumulative snapshots independently for two rollout identities', () => {
    adapter.parseChunk(JSON.stringify({
      timestamp: '2026-08-20T07:02:02.963Z', type: 'event_msg', payload: {
        type: 'token_count', info: { total_token_usage: {
          input_tokens: 100, cached_input_tokens: 80, output_tokens: 10, total_tokens: 110
        } }
      }
    }), config, '/tmp/rollout-dddddddd-1111-2222-3333-444444444444.jsonl');

    const frames = adapter.parseChunk(JSON.stringify({
      timestamp: '2026-08-20T07:02:02.963Z', type: 'event_msg', payload: {
        type: 'token_count', info: { total_token_usage: {
          input_tokens: 100, cached_input_tokens: 80, output_tokens: 10, total_tokens: 110
        } }
      }
    }), config, '/tmp/rollout-eeeeeeee-1111-2222-3333-444444444444.jsonl');

    expect(frames).toEqual([
      expect.objectContaining({ subagentId: 'thread-eeeeeeee', inputTokens: 20, outputTokens: 10, totalTokens: 30 })
    ]);
  });

  // Equivalence partitioning: malformed JSON and valid non-token events are ignored classes.
  it.each([
    ['malformed JSON', '{not-json'],
    ['non-token event', JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } })],
    ['wrong outer type', JSON.stringify({ type: 'response_item', payload: { type: 'token_count' } })],
    ['missing total usage', JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {} } })]
  ])('ignores %s', (_caseName, content) => {
    const frames = adapter.parseChunk(content, config, '/tmp/rollout-ffffffff-1111-2222-3333-444444444444.jsonl');

    expect(frames).toEqual([]);
  });

  // State-transition analysis: startup explicitly marks existing files as baseline-only.
  it('emits no historical burn for the first snapshot of a rollout marked as existing at cold start', () => {
    adapter.markExistingRollout('/tmp/rollout-11111111-1111-2222-3333-444444444444.jsonl');

    const frames = adapter.parseChunk(JSON.stringify({
      timestamp: '2026-08-20T07:02:02.963Z', type: 'event_msg', payload: {
        type: 'token_count', info: { total_token_usage: {
          input_tokens: 1000, cached_input_tokens: 800, output_tokens: 100, total_tokens: 1100
        } }
      }
    }), config, '/tmp/rollout-11111111-1111-2222-3333-444444444444.jsonl');

    expect(frames).toEqual([]);
  });

  // Error guessing: metadata refreshes must never be mistaken for token activity.
  it('loads a SQLite thread title without emitting a token frame', async () => {
    const metadataAdapter = new CodexAdapter(async (command: string) => {
      if (command.includes('.tables')) return { stdout: 'threads\n', stderr: '' };
      return { stdout: '01a01dfa-0e67-7283-a52e-acf0e3fd8c9b|Fix cached token accounting\n', stderr: '' };
    });

    const frames = await metadataAdapter.parseDatabase('/tmp/state_5.sqlite', config);

    expect(frames).toEqual([]);
  });

  // Domain analysis: rollout identity joins to the SQLite catalog title at the exact ID boundary.
  it('uses the SQLite catalog title for the matching rollout thread identity', async () => {
    const metadataAdapter = new CodexAdapter(async (command: string) => {
      if (command.includes('.tables')) return { stdout: 'threads\n', stderr: '' };
      return { stdout: '01a01dfa-0e67-7283-a52e-acf0e3fd8c9b|Fix cached token accounting\n', stderr: '' };
    });
    await metadataAdapter.parseDatabase('/tmp/state_5.sqlite', config);

    const frames = metadataAdapter.parseChunk(JSON.stringify({
      timestamp: '2026-08-20T07:02:02.963Z', type: 'event_msg', payload: {
        type: 'token_count', info: { total_token_usage: {
          input_tokens: 100, cached_input_tokens: 80, output_tokens: 10, total_tokens: 110
        } }
      }
    }), config, '/tmp/rollout-2026-08-20T00-02-02-01a01dfa-0e67-7283-a52e-acf0e3fd8c9b.jsonl');

    expect(frames).toEqual([
      expect.objectContaining({
        subagentId: 'thread-01a01dfa',
        subagentName: 'Fix cached token accounting'
      })
    ]);
  });
});
