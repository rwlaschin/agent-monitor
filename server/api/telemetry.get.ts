import { getTelemetryEngine } from '../utils/watcher';

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const engine = getTelemetryEngine();
  const eventStream = createEventStream(event);
  const refreshInterval = engine.getConfig().refreshIntervalMs || 500;

  let lastPayload = '';

  // Push immediate initial snapshot on connection
  try {
    const initialSnapshots = await engine.getSnapshot();
    lastPayload = JSON.stringify(initialSnapshots);
    await eventStream.push(lastPayload);
  } catch {}

  const interval = setInterval(async () => {
    try {
      const snapshots = await engine.getSnapshot();
      const payload = JSON.stringify(snapshots);
      if (payload !== lastPayload) {
        lastPayload = payload;
        await eventStream.push(payload);
      }
    } catch {
      clearInterval(interval);
    }
  }, refreshInterval);

  eventStream.onClosed(() => {
    clearInterval(interval);
  });

  return eventStream.send();
});
