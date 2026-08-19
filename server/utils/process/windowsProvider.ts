import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProcessProvider, ProcessLookupResult } from './types';

const execAsync = promisify(exec);

export class WindowsProcessProvider implements ProcessProvider {
  private execFn: (cmd: string, opts?: any) => Promise<{ stdout: string; stderr: string }>;

  constructor(execFn: (cmd: string, opts?: any) => Promise<{ stdout: string; stderr: string }> = execAsync) {
    this.execFn = execFn;
  }

  async isAlive(pid: number): Promise<boolean> {
    if (!pid || pid <= 0) return false;
    try {
      const { stdout } = await this.execFn(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { timeout: 1500 });
      return stdout.includes(`"${pid}"`);
    } catch {
      return false;
    }
  }

  async lookupPid(processName: string): Promise<ProcessLookupResult | null> {
    if (!processName) return null;
    try {
      const cleanName = processName.replace(/\.exe$/i, '');
      const { stdout } = await this.execFn(`tasklist /FI "IMAGENAME eq ${cleanName}*" /FO CSV /NH`, { timeout: 1500 });
      const lines = stdout.trim().split('\n').filter(l => l.trim().length > 0);
      
      for (const line of lines) {
        const match = line.match(/"([^"]+)","(\d+)"/);
        if (match) {
          const comm = match[1];
          const pid = parseInt(match[2], 10);
          if (!isNaN(pid) && pid > 0) {
            return { pid, comm };
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async listProcesses(): Promise<{ pid: number; name: string }[]> {
    try {
      const { stdout } = await this.execFn(`tasklist /FO CSV /NH`, { timeout: 2000 });
      const lines = stdout.trim().split('\n').filter(l => l.trim().length > 0);
      const results: { pid: number; name: string }[] = [];
      const seen = new Set<string>();

      for (const line of lines) {
        const match = line.match(/"([^"]+)","(\d+)"/);
        if (match) {
          const name = match[1].replace(/\.exe$/i, '');
          const pid = parseInt(match[2], 10);
          if (!isNaN(pid) && pid > 0 && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            results.push({ pid, name });
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  async kill(pid: number): Promise<boolean> {
    if (!pid || pid <= 0) return false;
    try {
      // /F = Forcefully terminate, /T = Terminate process and any child processes (tree kill)
      await this.execFn(`taskkill /F /T /PID ${pid}`, { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
}
