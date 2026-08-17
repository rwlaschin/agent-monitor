import { getTelemetryEngine } from '../utils/watcher';
import type { AppConfig } from '../types/telemetry';

export default defineEventHandler(async (event) => {
  const body = await readBody<AppConfig>(event);

  if (!body || !Array.isArray(body.agents)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid config structure' });
  }

  const engine = getTelemetryEngine();
  engine.saveConfig(body);

  return { success: true, config: engine.getConfig() };
});
