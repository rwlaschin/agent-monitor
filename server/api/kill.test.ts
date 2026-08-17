import { describe, it, expect, vi } from 'vitest';
import { executeKillProcess } from './kill';
import type { AgentConfig } from '../types/telemetry';

describe('executeKillProcess', () => {
  const mockConfig: AgentConfig = {
    id: 'claude',
    name: 'Claude Code',
    enabled: true,
    parser: 'json-cache',
    path: '~/.claude/stats-cache.json',
    processName: 'claude',
    color: '#a855f7'
  };

  it('rejects with error if process name does not match PID (Safety Check)', async () => {
    // Mock PID lookup returning a mismatching process (e.g. "Google Chrome")
    const mockLookup = vi.fn().mockResolvedValue({ pid: 1234, comm: 'Google Chrome' });
    const mockKiller = vi.fn().mockReturnValue(true);

    const result = await executeKillProcess(mockConfig, mockLookup, mockKiller);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Safety verification failed');
    expect(mockKiller).not.toHaveBeenCalled();
  });

  it('successfully terminates process when PID and process name match', async () => {
    const mockLookup = vi.fn().mockResolvedValue({ pid: 4892, comm: 'claude' });
    const mockKiller = vi.fn().mockReturnValue(true);

    const result = await executeKillProcess(mockConfig, mockLookup, mockKiller);
    expect(result.success).toBe(true);
    expect(result.pid).toBe(4892);
    expect(mockKiller).toHaveBeenCalledWith(4892);
  });

  it('handles case where process is already stopped / not found', async () => {
    const mockLookup = vi.fn().mockResolvedValue(null);
    const mockKiller = vi.fn();

    const result = await executeKillProcess(mockConfig, mockLookup, mockKiller);
    expect(result.success).toBe(false);
    expect(result.message).toContain('No running process found');
    expect(mockKiller).not.toHaveBeenCalled();
  });
});
