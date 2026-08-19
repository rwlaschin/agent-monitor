import type { AgentConfig } from '../types/telemetry';
import { processProvider } from '../utils/process/factory';
import type { ProcessLookupResult } from '../utils/process/types';

export type { ProcessLookupResult };
export type ProcessLookupFn = (processName: string) => Promise<ProcessLookupResult | null>;
export type ProcessKillerFn = (pid: number) => boolean | Promise<boolean>;

export async function defaultProcessLookup(processName: string): Promise<ProcessLookupResult | null> {
  return processProvider.lookupPid(processName);
}

export function defaultProcessKiller(pid: number): boolean | Promise<boolean> {
  return processProvider.kill(pid);
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
