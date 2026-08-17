import type { CanonicalTelemetryFrame, AgentConfig } from '../../types/telemetry';

export interface LogAdapter {
  parseChunk(chunk: string, config: AgentConfig, filePath?: string): CanonicalTelemetryFrame[];
  reset?(): void;
}
