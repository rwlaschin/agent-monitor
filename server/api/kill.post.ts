import { getTelemetryEngine } from '../utils/watcher';
import { executeKillProcess, defaultProcessKiller } from './kill';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { agentId, targetPid } = body;

  if (!agentId && !targetPid) {
    throw createError({ statusCode: 400, statusMessage: 'agentId or targetPid required' });
  }

  // If specific subagent targetPid was provided
  if (targetPid) {
    const success = defaultProcessKiller(parseInt(targetPid, 10));
    return {
      success,
      pid: targetPid,
      message: success ? `Terminated subagent PID ${targetPid}` : `Failed to terminate subagent PID ${targetPid}`
    };
  }

  const engine = getTelemetryEngine();
  const config = engine.getConfig();
  const agent = config.agents.find(a => a.id === agentId);

  if (!agent) {
    throw createError({ statusCode: 404, statusMessage: `Agent "${agentId}" not found in configuration` });
  }

  const result = await executeKillProcess(agent);

  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: result.message });
  }

  return result;
});
