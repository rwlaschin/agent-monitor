import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import { SqliteAdapter } from './sqliteAdapter';
import type { AgentConfig } from '../../types/telemetry';

describe('SqliteAdapter', () => {
  let adapter: SqliteAdapter;
  const mockConfig: AgentConfig = {
    id: 'codegpt',
    name: 'CodeGPT',
    enabled: true,
    parser: 'sqlite-db',
    path: '~/.codegpt/',
    processName: 'codegpt',
    color: '#10b981'
  };

  beforeEach(() => {
    adapter = new SqliteAdapter();
  });

  it('initializes cleanly and handles non-existent paths gracefully', async () => {
    const frames = await adapter.parseDatabase('/non/existent/path/codegpt.db', mockConfig);
    expect(frames).toEqual([]);
  });

  it('resets timestamp and row ID caches when reset() is called', () => {
    expect(() => adapter.reset()).not.toThrow();
  });

  it('satisfies LogAdapter parseChunk interface safely', () => {
    const frames = adapter.parseChunk('dummy content', mockConfig);
    expect(frames).toEqual([]);
  });

  it('correctly queries SQLite tables, schema, and rows via injected execFn', async () => {
    // Mock fs.existsSync for test database
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    const mockExec = async (cmd: string) => {
      if (cmd.includes('.tables')) {
        return { stdout: 'messages users settings\n', stderr: '' };
      }
      if (cmd.includes('PRAGMA table_info')) {
        return { 
          stdout: '0|id|INTEGER|0||1\n1|created_at|DATETIME|0||0\n2|prompt_tokens|INTEGER|0||0\n3|completion_tokens|INTEGER|0||0\n4|total_tokens|INTEGER|0||0\n5|conversation_id|TEXT|0||0\n',
          stderr: '' 
        };
      }
      if (cmd.includes('SELECT')) {
        // Return 2 rows: rowid | created_at | prompt_tokens | completion_tokens | total_tokens | conversation_id
        return {
          stdout: '1|1724000000000|150|80|230|session-alpha\n2|1724000060000|400|200|600|session-beta\n',
          stderr: ''
        };
      }
      return { stdout: '', stderr: '' };
    };

    const mockAdapter = new SqliteAdapter(mockExec);
    const frames = await mockAdapter.parseDatabase('/dummy/codegpt.db', mockConfig);

    expect(frames.length).toBe(2);
    expect(frames[0].agentId).toBe('codegpt');
    expect(frames[0].subagentId).toBe('session-alpha');
    expect(frames[0].inputTokens).toBe(150);
    expect(frames[0].outputTokens).toBe(80);
    expect(frames[0].totalTokens).toBe(230);

    expect(frames[1].subagentId).toBe('session-beta');
    expect(frames[1].totalTokens).toBe(600);
  });
});
