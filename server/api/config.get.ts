import { getTelemetryEngine } from '../utils/watcher';

export default defineEventHandler(() => {
  const engine = getTelemetryEngine();
  return engine.getConfig();
});
