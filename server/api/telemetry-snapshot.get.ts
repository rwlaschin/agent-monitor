import { getTelemetryEngine } from '../utils/watcher';
import type { AgentTelemetrySnapshot } from '../types/telemetry';

export default defineEventHandler(async (): Promise<AgentTelemetrySnapshot[]> => {
  const engine = getTelemetryEngine();
  return await engine.getSnapshot();
});
