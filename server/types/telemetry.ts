export type ParserType = 'json-cache' | 'jsonl-stream' | 'regex-log' | 'sqlite-db';

export interface AgentConfig {
  id: string;
  name: string;
  enabled: boolean;
  parser: ParserType;
  path: string;
  processName: string;
  color: string;
  alertThreshold?: number; // tokens/min
  statusUrl?: string; // e.g. https://status.claude.com/ or https://status.openai.com/
}

export interface AppConfig {
  slidingWindowMinutes: number;
  refreshIntervalMs: number;
  agents: AgentConfig[];
}

export interface CanonicalTelemetryFrame {
  agentId: string;
  agentName: string;
  subagentId?: string;
  subagentName?: string;
  timestamp: number; // Epoch ms
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  activePid?: number | null;
  status: 'active' | 'idle' | 'warning' | 'stopped';
}

export interface MinuteBucket {
  timestamp: number; // Minute start in epoch ms
  totalTokens: number;
  mainTokens: number;
  subagentTokens: Record<string, { name: string; tokens: number; color: string }>;
}

export interface AgentTelemetrySnapshot {
  agentId: string;
  agentName: string;
  color: string;
  status: 'active' | 'idle' | 'warning' | 'stopped';
  activePid: number | null;
  currentRate: number; // Tokens in the latest minute bucket
  localMax: number;    // Peak rate in current sliding window
  totalTokens24h: number;
  alertThreshold: number;
  isAlertBreached: boolean;
  history: MinuteBucket[]; // 15 rolling minute buckets
  statusUrl?: string;
  providerHealth?: {
    status: 'operational' | 'degraded' | 'major_outage' | 'offline' | 'unknown';
    description: string;
    url: string;
  };
  subagents: Array<{
    id: string;
    name: string;
    color: string;
    currentRate: number;
    pid: number | null;
  }>;
}
