import fs from 'fs';
import path from 'path';
import os from 'os';

function resolveHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const targetPath = body?.path?.trim();

  if (!targetPath) {
    return {
      valid: false,
      exists: false,
      error: 'Path cannot be empty',
      fileCount: 0,
      sampleFiles: []
    };
  }

  const resolved = resolveHome(targetPath);

  if (!fs.existsSync(resolved)) {
    return {
      valid: false,
      exists: false,
      resolvedPath: resolved,
      error: `Path does not exist on disk: ${resolved}`,
      fileCount: 0,
      sampleFiles: []
    };
  }

  try {
    const stats = fs.statSync(resolved);
    if (stats.isFile()) {
      return {
        valid: true,
        exists: true,
        isDirectory: false,
        resolvedPath: resolved,
        fileCount: 1,
        sampleFiles: [path.basename(resolved)],
        sizeBytes: stats.size
      };
    }

    // Directory discovery check
    const matchedFiles: string[] = [];
    const scanDir = (dir: string, depth = 0) => {
      if (depth > 4 || matchedFiles.length >= 20) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.name.startsWith('.') && e.name !== '.system_generated' && e.name !== '.claude') continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            scanDir(full, depth + 1);
          } else if (e.isFile()) {
            if (e.name.endsWith('.jsonl') || e.name.endsWith('.log') || e.name === 'stats-cache.json' || (dir.includes('sessions') && e.name.endsWith('.json'))) {
              matchedFiles.push(full);
            }
          }
        }
      } catch {}
    };

    scanDir(resolved);

    if (matchedFiles.length === 0) {
      return {
        valid: true,
        exists: true,
        isDirectory: true,
        resolvedPath: resolved,
        fileCount: 0,
        warning: 'Directory exists, but no active transcript or log streams were detected.',
        sampleFiles: []
      };
    }

    return {
      valid: true,
      exists: true,
      isDirectory: true,
      resolvedPath: resolved,
      fileCount: matchedFiles.length,
      sampleFiles: matchedFiles.slice(0, 5).map(f => path.relative(resolved, f) || path.basename(f))
    };
  } catch (err: any) {
    return {
      valid: false,
      exists: true,
      resolvedPath: resolved,
      error: err?.message || 'Failed to inspect path',
      fileCount: 0,
      sampleFiles: []
    };
  }
});
