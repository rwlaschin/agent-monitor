import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TelemetryEngine } from './watcher';
import { SlidingWindowRingBuffer } from './ringBuffer';
import { CodexAdapter } from './adapters/codexAdapter';
import type { AppConfig } from '../types/telemetry';

describe('TelemetryEngine snapshot subagent filtering', () => {
  // Domain analysis: the process is off the current-rate and PID boundaries, but remains
  // on the positive-token side of the displayed-history boundary.
  it('retains a PID-less process that burned tokens earlier in the displayed 15-minute history', async () => {
    const engine = new TelemetryEngine('/tmp/agent-monitor-nonexistent-history-config-a.json');
    await engine.initAgents();
    const buffer = new SlidingWindowRingBuffer(15);
    buffer.ingest({
      agentId: 'claude',
      agentName: 'Claude Code',
      subagentId: 'project--historical-work',
      subagentName: 'Historical Work',
      timestamp: Date.now() - 120000,
      inputTokens: 700,
      outputTokens: 300,
      totalTokens: 1000,
      activePid: null,
      status: 'active'
    });
    const mutableEngine = engine as unknown as {
      config: AppConfig;
      buffers: Map<string, SlidingWindowRingBuffer>;
      knownProcesses: Map<string, Map<string, { id: string; name: string; pid: number | null }>>;
    };
    mutableEngine.config = {
      slidingWindowMinutes: 15,
      refreshIntervalMs: 500,
      agents: [{
        id: 'claude',
        name: 'Claude Code',
        enabled: true,
        parser: 'json-cache',
        path: '/tmp/claude-history.json',
        processName: 'claude',
        color: '#ec4899'
      }]
    };
    mutableEngine.buffers.set('claude', buffer);
    mutableEngine.knownProcesses.set('claude', new Map([
      ['project--historical-work', {
        id: 'project--historical-work',
        name: 'Historical Work',
        pid: null
      }]
    ]));

    const snapshots = await engine.getSnapshot();

    expect(snapshots[0].subagents).toEqual([
      expect.objectContaining({
        id: 'project--historical-work',
        name: 'Historical Work',
        currentRate: 0,
        pid: null
      })
    ]);
  });

  // Equivalence partitioning and boundary analysis: zero PID, zero current rate, and zero
  // tokens in every displayed bucket remains outside the visible-process partition.
  it('filters a PID-less process with zero tokens throughout the displayed 15-minute history', async () => {
    const engine = new TelemetryEngine('/tmp/agent-monitor-nonexistent-history-config-b.json');
    await engine.initAgents();
    const mutableEngine = engine as unknown as {
      config: AppConfig;
      buffers: Map<string, SlidingWindowRingBuffer>;
      knownProcesses: Map<string, Map<string, { id: string; name: string; pid: number | null }>>;
    };
    mutableEngine.config = {
      slidingWindowMinutes: 15,
      refreshIntervalMs: 500,
      agents: [{
        id: 'claude',
        name: 'Claude Code',
        enabled: true,
        parser: 'json-cache',
        path: '/tmp/claude-history.json',
        processName: 'claude',
        color: '#ec4899'
      }]
    };
    mutableEngine.buffers.set('claude', new SlidingWindowRingBuffer(15));
    mutableEngine.knownProcesses.set('claude', new Map([
      ['project--never-active', {
        id: 'project--never-active',
        name: 'Never Active',
        pid: null
      }]
    ]));

    const snapshots = await engine.getSnapshot();

    expect(snapshots[0].subagents).toEqual([]);
  });
});

describe('TelemetryEngine Codex source routing', () => {
  const codegptConfig = {
    id: 'codegpt',
    name: 'Codegpt',
    enabled: true,
    parser: 'sqlite-db' as const,
    path: '~/.codex',
    processName: 'codegpt',
    color: '#f97316'
  };

  // Equivalence partitioning: primary DB and WAL are two valid metadata-change classes.
  it.each([
    ['primary state database', 'state_5.sqlite', '/codex-state/state_5.sqlite'],
    ['state database WAL', 'state_5.sqlite-wal', '/codex-state/state_5.sqlite']
  ])('routes a %s change to metadata parsing of the primary database', async (_caseName, filename, expectedSuffix) => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-monitor-codex-db-'));
    const targetFile = path.join(tempDirectory, 'codex-state', filename);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, 'sqlite bytes');
    if (filename.endsWith('-wal')) fs.writeFileSync(path.join(tempDirectory, 'codex-state', 'state_5.sqlite'), 'sqlite bytes');
    const parseDatabase = vi.fn(async () => []);
    const engine = new TelemetryEngine(path.join(tempDirectory, 'missing-config.json'));
    const mutableEngine = engine as unknown as {
      adapters: Map<string, { parseDatabase: typeof parseDatabase; parseChunk: ReturnType<typeof vi.fn> }>;
      buffers: Map<string, SlidingWindowRingBuffer>;
      handleFileChange: (agent: typeof codegptConfig, target: string) => Promise<void>;
    };
    mutableEngine.adapters.set('codegpt', { parseDatabase, parseChunk: vi.fn(() => []) });
    mutableEngine.buffers.set('codegpt', new SlidingWindowRingBuffer(15));

    await mutableEngine.handleFileChange(codegptConfig, targetFile);

    expect({ calls: parseDatabase.mock.calls.length, databasePath: parseDatabase.mock.calls[0]?.[0] }).toEqual({
      calls: 1,
      databasePath: `${tempDirectory}${expectedSuffix}`
    });
  });

  // Domain analysis: a JSONL rollout under a sqlite-configured agent is telemetry, not metadata.
  it('routes a Codex rollout JSONL change to token chunk parsing', async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-monitor-codex-rollout-'));
    const targetFile = path.join(tempDirectory, 'sessions', '2026', '08', '20', 'rollout-2026-08-20T00-02-02-01a01dfa-0e67-7283-a52e-acf0e3fd8c9b.jsonl');
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, '{"type":"event_msg","payload":{"type":"token_count"}}\n');
    const parseChunk = vi.fn(() => []);
    const parseDatabase = vi.fn(async () => []);
    const engine = new TelemetryEngine(path.join(tempDirectory, 'missing-config.json'));
    const mutableEngine = engine as unknown as {
      adapters: Map<string, { parseDatabase: typeof parseDatabase; parseChunk: typeof parseChunk }>;
      buffers: Map<string, SlidingWindowRingBuffer>;
      handleFileChange: (agent: typeof codegptConfig, target: string) => Promise<void>;
    };
    mutableEngine.adapters.set('codegpt', { parseDatabase, parseChunk });
    mutableEngine.buffers.set('codegpt', new SlidingWindowRingBuffer(15));

    await mutableEngine.handleFileChange(codegptConfig, targetFile);

    expect({
      metadataCalls: parseDatabase.mock.calls.length,
      tokenCalls: parseChunk.mock.calls.length,
      content: parseChunk.mock.calls[0]?.[0],
      filePath: parseChunk.mock.calls[0]?.[2]
    }).toEqual({
      metadataCalls: 0,
      tokenCalls: 1,
      content: '{"type":"event_msg","payload":{"type":"token_count"}}\n',
      filePath: targetFile
    });
  });

  // Error guessing: unrelated JSON/config/cache files in ~/.codex must not enter either parser.
  it.each([
    ['root configuration', 'config.json'],
    ['model cache', 'models_cache.json'],
    ['shell snapshot', 'shell_snapshots/session.sh']
  ])('ignores an unrelated Codex %s file', async (_caseName, relativePath) => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-monitor-codex-ignore-'));
    const targetFile = path.join(tempDirectory, relativePath);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, '{}\n');
    const parseChunk = vi.fn(() => []);
    const parseDatabase = vi.fn(async () => []);
    const engine = new TelemetryEngine(path.join(tempDirectory, 'missing-config.json'));
    const mutableEngine = engine as unknown as {
      adapters: Map<string, { parseDatabase: typeof parseDatabase; parseChunk: typeof parseChunk }>;
      buffers: Map<string, SlidingWindowRingBuffer>;
      handleFileChange: (agent: typeof codegptConfig, target: string) => Promise<void>;
    };
    mutableEngine.adapters.set('codegpt', { parseDatabase, parseChunk });
    mutableEngine.buffers.set('codegpt', new SlidingWindowRingBuffer(15));

    await mutableEngine.handleFileChange(codegptConfig, targetFile);

    expect({ metadataCalls: parseDatabase.mock.calls.length, tokenCalls: parseChunk.mock.calls.length }).toEqual({
      metadataCalls: 0,
      tokenCalls: 0
    });
  });

  // Error guessing and state-transition analysis: native watchers may re-enter before an
  // asynchronous read completes. A file is a serial stream, so callbacks must be serialized.
  it('coalesces concurrent callbacks for the same rollout into one token ingestion', async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-monitor-codex-concurrent-'));
    const targetFile = path.join(tempDirectory, 'sessions', '2026', '08', '20', 'rollout-22222222-1111-2222-3333-444444444444.jsonl');
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, '{"type":"event_msg"}\n');
    let releaseRead: (() => void) | undefined;
    const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
    let readNumber = 0;
    const readNewBytes = vi.fn(async () => {
      await readGate;
      readNumber += 1;
      return readNumber === 1 ? '{"type":"event_msg"}\n' : '';
    });
    const parseChunk = vi.fn(() => [{
      agentId: 'codegpt', agentName: 'Codegpt', subagentId: 'thread-22222222',
      subagentName: 'Concurrent rollout', timestamp: 1787209322963,
      inputTokens: 10, outputTokens: 5, totalTokens: 15, status: 'active' as const
    }]);
    const ingest = vi.fn();
    const engine = new TelemetryEngine(path.join(tempDirectory, 'missing-config.json'));
    const mutableEngine = engine as unknown as {
      adapters: Map<string, { parseDatabase: ReturnType<typeof vi.fn>; parseChunk: typeof parseChunk }>;
      buffers: Map<string, { ingest: typeof ingest }>;
      tailers: Map<string, { readNewBytes: typeof readNewBytes }>;
      handleFileChange: (agent: typeof codegptConfig, target: string) => Promise<void>;
    };
    mutableEngine.adapters.set('codegpt', { parseDatabase: vi.fn(async () => []), parseChunk });
    mutableEngine.buffers.set('codegpt', { ingest });
    mutableEngine.tailers.set(targetFile, { readNewBytes });

    const firstCallback = mutableEngine.handleFileChange(codegptConfig, targetFile);
    const duplicateCallback = mutableEngine.handleFileChange(codegptConfig, targetFile);
    releaseRead?.();
    await Promise.all([firstCallback, duplicateCallback]);

    expect({ reads: readNewBytes.mock.calls.length, parses: parseChunk.mock.calls.length, ingestions: ingest.mock.calls.length }).toEqual({
      reads: 2,
      parses: 1,
      ingestions: 1
    });
  });

  // Error guessing and asynchronous state analysis: an event received during an active read
  // is not a duplicate when bytes arrive afterward. It must schedule one follow-up drain.
  it('queues one follow-up read when new rollout bytes arrive during an in-flight read', async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-monitor-codex-later-bytes-'));
    const targetFile = path.join(tempDirectory, 'sessions', '2026', '08', '20', 'rollout-44444444-1111-2222-3333-444444444444.jsonl');
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, '{"snapshot":"first"}\n');
    let releaseFirstRead: (() => void) | undefined;
    const firstReadGate = new Promise<void>(resolve => { releaseFirstRead = resolve; });
    let readInProgress = false;
    let completedReads = 0;
    const readNewBytes = vi.fn(async () => {
      if (readInProgress) return '';
      readInProgress = true;
      if (completedReads === 0) await firstReadGate;
      const content = completedReads === 0
        ? '{"snapshot":"first"}\n'
        : '{"snapshot":"later"}\n';
      completedReads += 1;
      readInProgress = false;
      return content;
    });
    const firstFrame = {
      agentId: 'codegpt', agentName: 'Codegpt', subagentId: 'thread-44444444',
      subagentName: 'Queued rollout', timestamp: 1787209322963,
      inputTokens: 10, outputTokens: 0, totalTokens: 10, status: 'active' as const
    };
    const laterFrame = {
      agentId: 'codegpt', agentName: 'Codegpt', subagentId: 'thread-44444444',
      subagentName: 'Queued rollout', timestamp: 1787209380000,
      inputTokens: 0, outputTokens: 5, totalTokens: 5, status: 'active' as const
    };
    const parseChunk = vi.fn((content: string) => content.includes('later') ? [laterFrame] : [firstFrame]);
    const ingest = vi.fn();
    const engine = new TelemetryEngine(path.join(tempDirectory, 'missing-config.json'));
    const mutableEngine = engine as unknown as {
      adapters: Map<string, { parseDatabase: ReturnType<typeof vi.fn>; parseChunk: typeof parseChunk }>;
      buffers: Map<string, { ingest: typeof ingest }>;
      tailers: Map<string, { readNewBytes: typeof readNewBytes }>;
      handleFileChange: (agent: typeof codegptConfig, target: string) => Promise<void>;
    };
    mutableEngine.adapters.set('codegpt', { parseDatabase: vi.fn(async () => []), parseChunk });
    mutableEngine.buffers.set('codegpt', { ingest });
    mutableEngine.tailers.set(targetFile, { readNewBytes });

    const firstCallback = mutableEngine.handleFileChange(codegptConfig, targetFile);
    const laterBytesCallback = mutableEngine.handleFileChange(codegptConfig, targetFile);
    releaseFirstRead?.();
    await Promise.all([firstCallback, laterBytesCallback]);

    expect(ingest.mock.calls).toEqual([
      [firstFrame],
      [laterFrame]
    ]);
  });

  // Boundary analysis: rollout 257 is just outside the startup newest-256 cap. The metadata
  // catalog still proves it predates monitoring, so a later watcher event must not replay it.
  it('baselines an old catalogued rollout first discovered by a later watcher callback', async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-monitor-codex-late-old-'));
    const targetFile = path.join(tempDirectory, 'sessions', '2026', '08', '19', 'rollout-33333333-1111-2222-3333-444444444444.jsonl');
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, [
      JSON.stringify({
        timestamp: '2026-08-19T06:00:00.000Z', type: 'event_msg', payload: {
          type: 'token_count', info: { total_token_usage: {
            input_tokens: 1000000, cached_input_tokens: 900000, output_tokens: 10000, total_tokens: 1010000
          } }
        }
      }),
      JSON.stringify({
        timestamp: '2026-08-20T07:02:02.963Z', type: 'event_msg', payload: {
          type: 'token_count', info: { total_token_usage: {
            input_tokens: 1000100, cached_input_tokens: 900080, output_tokens: 10005, total_tokens: 1010105
          } }
        }
      })
    ].join('\n') + '\n');
    const adapter = new CodexAdapter(async (command: string) => {
      if (command.includes('.tables')) return { stdout: 'threads\n', stderr: '' };
      return { stdout: `33333333-1111-2222-3333-444444444444|Old rollout|${targetFile}\n`, stderr: '' };
    });
    await adapter.parseDatabase(path.join(tempDirectory, 'state_5.sqlite'), codegptConfig);
    const ingest = vi.fn();
    const engine = new TelemetryEngine(path.join(tempDirectory, 'missing-config.json'));
    const mutableEngine = engine as unknown as {
      adapters: Map<string, CodexAdapter>;
      buffers: Map<string, { ingest: typeof ingest }>;
      handleFileChange: (agent: typeof codegptConfig, target: string) => Promise<void>;
    };
    mutableEngine.adapters.set('codegpt', adapter);
    mutableEngine.buffers.set('codegpt', { ingest });

    await mutableEngine.handleFileChange(codegptConfig, targetFile);

    expect(ingest.mock.calls).toEqual([]);
  });
});
