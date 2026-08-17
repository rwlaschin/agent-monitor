import { describe, it, expect, beforeEach } from 'vitest';
import { AntigravityAdapter } from './antigravityAdapter';
import type { AgentConfig } from '../../types/telemetry';

describe('AntigravityAdapter', () => {
  let adapter: AntigravityAdapter;
  const mockConfig: AgentConfig = {
    id: 'antigravity',
    name: 'Antigravity',
    enabled: true,
    parser: 'jsonl-stream',
    path: '~/.gemini/antigravity/brain/',
    processName: 'antigravity',
    color: '#06b6d4'
  };

  beforeEach(() => {
    adapter = new AntigravityAdapter();
  });

  it('parses JSONL lines with tool calls and token metadata', () => {
    const rawJsonlChunk = [
      JSON.stringify({
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        tool_calls: [{ toolAction: 'Searching code' }],
        usage_metadata: { prompt_token_count: 500, candidates_token_count: 120 }
      }),
      JSON.stringify({
        step_index: 2,
        type: 'USER_INPUT',
        content: 'Next instruction'
      })
    ].join('\n') + '\n';

    const frames = adapter.parseChunk(rawJsonlChunk, mockConfig);
    expect(frames.length).toBe(2);
    expect(frames[0].inputTokens).toBe(500);
    expect(frames[0].outputTokens).toBe(120);
    expect(frames[0].totalTokens).toBe(620);
    expect(frames[0].agentId).toBe('antigravity');
    expect(frames[0].status).toBe('active');
  });

  it('extracts subagent information when invoke_subagent step is detected', () => {
    const rawJsonlChunk = JSON.stringify({
      step_index: 3,
      type: 'PLANNER_RESPONSE',
      tool_calls: [{
        toolAction: 'Invoking subagent',
        Subagents: [{ Role: 'Code Researcher', TypeName: 'research' }]
      }],
      subagent_id: 'subagent-research-01',
      subagent_name: 'Code Researcher',
      usage_metadata: { prompt_token_count: 1200, candidates_token_count: 300 }
    }) + '\n';

    const frames = adapter.parseChunk(rawJsonlChunk, mockConfig);
    expect(frames.length).toBe(1);
    expect(frames[0].subagentId).toBe('subagent-research-01');
    expect(frames[0].subagentName).toBe('Code Researcher');
    expect(frames[0].totalTokens).toBe(1500);
  });

  it('buffers partial lines across chunks without crashing', () => {
    const chunkPart1 = '{"step_index": 4, "type": "PLANNER_RESPONSE", ';
    const chunkPart2 = '"usage_metadata": {"prompt_token_count": 200, "candidates_token_count": 80}}\n';

    const frames1 = adapter.parseChunk(chunkPart1, mockConfig);
    expect(frames1.length).toBe(0); // Incomplete line, buffered

    const frames2 = adapter.parseChunk(chunkPart2, mockConfig);
    expect(frames2.length).toBe(1);
    expect(frames2[0].totalTokens).toBe(280);
  });

  it('estimates tokens from payload length when usage_metadata is absent (real-world schema)', () => {
    const realStep = JSON.stringify({
      step_index: 0,
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      status: 'DONE',
      created_at: '2026-08-16T15:54:46Z',
      content: 'Hello, please refactor this file.'
    }) + '\n';

    const frames = adapter.parseChunk(realStep, mockConfig);
    expect(frames.length).toBe(1);
    expect(frames[0].inputTokens).toBeGreaterThan(0);
    expect(frames[0].timestamp).toBe(new Date('2026-08-16T15:54:46Z').getTime());
  });
});
