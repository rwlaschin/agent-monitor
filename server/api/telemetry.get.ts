import { getTelemetryEngine } from '../utils/watcher';

export default defineEventHandler(async (event) => {
  const req = event.node.req;
  const res = event.node.res;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });

  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  const engine = getTelemetryEngine();
  const refreshInterval = engine.getConfig().refreshIntervalMs || 500;

  const pushSnapshot = async () => {
    try {
      if (res.writableEnded || res.destroyed) return;
      const snapshots = await engine.getSnapshot();
      res.write(`data: ${JSON.stringify(snapshots)}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch {}
  };

  // Immediate push on connect
  await pushSnapshot();

  return new Promise<void>((resolve) => {
    const cleanup = () => {
      clearInterval(interval);
      resolve();
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('close', cleanup);
    res.on('finish', cleanup);
    res.on('error', cleanup);
  });
});
