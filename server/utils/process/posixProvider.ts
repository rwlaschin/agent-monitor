import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import process from 'node:process';
import type { ProcessProvider, ProcessLookupResult } from './types';

const execAsync = promisify(exec);

export class PosixProcessProvider implements ProcessProvider {
  isAlive(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      // 0ms native kernel syscall on macOS & Linux (no subprocess spawned)
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      // ESRCH: no such process (dead)
      // EPERM: process exists, user lacks permission (alive)
      return err.code === 'EPERM';
    }
  }

  async lookupPid(processName: string): Promise<ProcessLookupResult | null> {
    if (!processName) return null;
    try {
      const { stdout: pgrepOutput } = await execAsync(`pgrep -f "${processName}"`, { timeout: 1500 });
      const pids = pgrepOutput.trim().split('\n')
        .map(p => parseInt(p.trim(), 10))
        .filter(p => !isNaN(p) && p !== process.pid);

      if (pids.length === 0) return null;

      const targetPid = pids[pids.length - 1];
      let comm = processName;
      try {
        const { stdout: commOutput } = await execAsync(`ps -p ${targetPid} -o command=`, { timeout: 1500 });
        if (commOutput.trim()) {
          comm = commOutput.trim();
        }
      } catch {}

      return { pid: targetPid, comm };
    } catch {
      return null;
    }
  }

  async listProcesses(): Promise<{ pid: number; name: string }[]> {
    try {
      const user = process.env.USER || '';
      const cmd = user ? `ps -u "${user}" -o pid,comm` : `ps -o pid,comm`;
      const { stdout } = await execAsync(cmd, { timeout: 2000 });
      const lines = stdout.trim().split('\n').slice(1);
      const results: { pid: number; name: string }[] = [];
      const seen = new Set<string>();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const pid = parseInt(parts[0], 10);
          const fullPath = parts.slice(1).join(' ');
          const baseName = fullPath.split('/').pop() || fullPath;
          if (!isNaN(pid) && pid > 0 && baseName && !seen.has(baseName.toLowerCase())) {
            seen.add(baseName.toLowerCase());
            results.push({ pid, name: baseName });
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
      process.kill(pid, 'SIGKILL');
      return true;
    } catch {
      return false;
    }
  }
}
