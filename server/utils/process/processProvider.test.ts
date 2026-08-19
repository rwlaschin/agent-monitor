import { describe, it, expect } from 'vitest';
import process from 'node:process';
import { PosixProcessProvider } from './posixProvider';
import { WindowsProcessProvider } from './windowsProvider';
import { getProcessProvider } from './factory';

describe('ProcessProvider Strategy & Factory', () => {
  it('creates PosixProcessProvider for darwin/linux and WindowsProcessProvider for win32', () => {
    const posix = getProcessProvider('darwin');
    expect(posix).toBeInstanceOf(PosixProcessProvider);

    const linux = getProcessProvider('linux');
    expect(linux).toBeInstanceOf(PosixProcessProvider);

    const win = getProcessProvider('win32');
    expect(win).toBeInstanceOf(WindowsProcessProvider);
  });

  describe('PosixProcessProvider', () => {
    const provider = new PosixProcessProvider();

    it('accurately verifies current process is alive via signal 0 syscall', () => {
      expect(provider.isAlive(process.pid)).toBe(true);
    });

    it('returns false for invalid or non-existent PIDs', () => {
      expect(provider.isAlive(0)).toBe(false);
      expect(provider.isAlive(-1)).toBe(false);
      expect(provider.isAlive(99999999)).toBe(false);
    });
  });

  describe('WindowsProcessProvider', () => {
    it('handles non-existent or invalid PIDs safely without throwing', async () => {
      const provider = new WindowsProcessProvider();
      const alive = await provider.isAlive(0);
      expect(alive).toBe(false);

      const negativeAlive = await provider.isAlive(-10);
      expect(negativeAlive).toBe(false);
    });

    it('correctly parses Windows tasklist CSV output to check liveness', async () => {
      const mockExec = async (cmd: string) => {
        expect(cmd).toContain('tasklist /FI "PID eq 4892"');
        return { stdout: '"claude.exe","4892","Console","1","54,220 K"\n', stderr: '' };
      };

      const provider = new WindowsProcessProvider(mockExec);
      const alive = await provider.isAlive(4892);
      expect(alive).toBe(true);
    });

    it('returns false when tasklist reports no matching process', async () => {
      const mockExec = async () => {
        return { stdout: 'INFO: No tasks are running which match the specified criteria.\n', stderr: '' };
      };

      const provider = new WindowsProcessProvider(mockExec);
      const alive = await provider.isAlive(9999);
      expect(alive).toBe(false);
    });

    it('correctly parses Windows tasklist lookup to find target PID and executable name', async () => {
      const mockExec = async (cmd: string) => {
        expect(cmd).toContain('tasklist /FI "IMAGENAME eq claude*"');
        return { stdout: '"claude.exe","7812","Console","1","61,100 K"\n', stderr: '' };
      };

      const provider = new WindowsProcessProvider(mockExec);
      const result = await provider.lookupPid('claude');
      expect(result).toEqual({ pid: 7812, comm: 'claude.exe' });
    });

    it('dispatches taskkill with /F /T tree kill flags on Windows', async () => {
      let executedCmd = '';
      const mockExec = async (cmd: string) => {
        executedCmd = cmd;
        return { stdout: 'SUCCESS: The process with PID 7812 has been terminated.\n', stderr: '' };
      };

      const provider = new WindowsProcessProvider(mockExec);
      const killed = await provider.kill(7812);
      expect(killed).toBe(true);
      expect(executedCmd).toContain('taskkill /F /T /PID 7812');
    });
  });
});
