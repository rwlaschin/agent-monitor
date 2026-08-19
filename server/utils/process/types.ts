export interface ProcessLookupResult {
  pid: number;
  comm: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
}

export interface ProcessProvider {
  isAlive(pid: number): boolean | Promise<boolean>;
  lookupPid(processName: string): Promise<ProcessLookupResult | null>;
  listProcesses?(): Promise<ProcessInfo[]>;
  kill(pid: number): Promise<boolean>;
}
