import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentConfig } from '../types/telemetry';

const execAsync = promisify(exec);

export interface ProcessLookupResult {
  pid: number;
  comm: string;
}

export type ProcessLookupFn = (processName: string) => Promise<ProcessLookupResult | null>;
export type ProcessKillerFn = (pid: number) => boolean;

export async function defaultProcessLookup(processName: string): Promise<ProcessLookupResult | null> {
  try {
    const { stdout: pgrepOutput } = await execAsync(`pgrep -f "${processName}"`, { timeout: 1500 });
    const pids = pgrepOutput.trim().split('\n').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));

    if (pids.length === 0) return null;

    // Pick the most recent PID that is not the current process
    const filteredPids = pids.filter(p => p !== process.pid);
    if (filteredPids.length === 0) return null;

    const targetPid = filteredPids[filteredPids.length - 1];
    const { stdout: comm } = await execAsync(`ps -p ${targetPid} -o command=`, { timeout: 1500 });

    return { pid: targetPid, comm: comm.trim() };
  } catch {
    return null;
  }
}

export function defaultProcessKiller(pid: number): boolean {
  try {
    process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

export async function executeKillProcess(
  config: AgentConfig,
  lookupFn: ProcessLookupFn = defaultProcessLookup,
  killerFn: ProcessKillerFn = defaultProcessKiller
): Promise<{ success: boolean; pid?: number; message: string }> {
  const target = await lookupFn(config.processName);

  if (!target) {
    return { success: false, message: `No running process found matching "${config.processName}"` };
  }

  // Safety Verification Check: Verify target command contains or matches expected processName
  const normalizedComm = target.comm.toLowerCase();
  const normalizedExpected = config.processName.toLowerCase();

  if (!normalizedComm.includes(normalizedExpected) && !normalizedExpected.includes(normalizedComm)) {
    return {
      success: false,
      message: `Safety verification failed: PID ${target.pid} command "${target.comm}" does not match configured name "${config.processName}"`
    };
  }

  const killed = killerFn(target.pid);

  if (!killed) {
    return { success: false, message: `Failed to dispatch termination signal to PID ${target.pid}` };
  }

  return { success: true, pid: target.pid, message: `Successfully terminated PID ${target.pid} (${config.name})` };
}
