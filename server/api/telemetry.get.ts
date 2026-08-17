import { getTelemetryEngine } from '../utils/watcher';

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const engine = getTelemetryEngine();
  const eventStream = createEventStream(event);

  const interval = setInterval(async () => {
    try {
      const snapshots = await engine.getSnapshot();
      await eventStream.push(JSON.stringify(snapshots));
    } catch {
      clearInterval(interval);
    }
  }, 500);

  eventStream.onClosed(() => {
    clearInterval(interval);
  });

  return eventStream.send();
});
