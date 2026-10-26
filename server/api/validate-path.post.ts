import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function resolveHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

function inferParser(resolvedPath: string, files: string[]): { parser: string; label: string } {
  const normPath = resolvedPath.toLowerCase();

  // 1. Check for SQLite databases
  const hasSqlite = files.some(f => 
    f.endsWith('.sqlite') || 
    f.endsWith('.db') || 
    f.endsWith('.sqlite3') || 
    f.endsWith('.vscdb')
  ) || normPath.endsWith('.db') || normPath.endsWith('.sqlite') || normPath.includes('codegpt');

  if (hasSqlite) {
    return { parser: 'sqlite-db', label: 'SQLite Database' };
  }

  // 2. Check for Claude Code structure
  if (
    normPath.includes('.claude') || 
    files.some(f => f.includes('projects') || f.includes('sessions') || f.endsWith('stats-cache.json'))
  ) {
    return { parser: 'claude-stream', label: 'Claude Code Stream' };
  }

  // 3. Check for JSONL streams (Antigravity, OpenAI, standard JSONL)
  if (
    files.some(f => f.endsWith('.jsonl') || f.endsWith('transcript.jsonl')) || 
    normPath.endsWith('.jsonl') || 
    normPath.includes('antigravity') || 
    normPath.includes('brain')
  ) {
    return { parser: 'jsonl-stream', label: 'JSONL Stream' };
  }

  // 4. Check for JSON stats cache
  if (files.some(f => f.endsWith('.json')) || normPath.endsWith('.json')) {
    return { parser: 'json-cache', label: 'JSON Cache' };
  }

  // 5. Plaintext logs
  return { parser: 'regex-log', label: 'Plain Text Log' };
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

  if (!existsSync(resolved)) {
    const inferred = inferParser(resolved, []);
    return {
      valid: false,
      exists: false,
      resolvedPath: resolved,
      detectedParser: inferred.parser,
      detectedParserLabel: inferred.label,
      error: `Path does not exist on disk: ${resolved}`,
      fileCount: 0,
      sampleFiles: []
    };
  }

  try {
    const stats = statSync(resolved);
    if (stats.isFile()) {
      const inferred = inferParser(resolved, [resolved]);
      return {
        valid: true,
        exists: true,
        isDirectory: false,
        resolvedPath: resolved,
        detectedParser: inferred.parser,
        detectedParserLabel: inferred.label,
        fileCount: 1,
        sampleFiles: [path.basename(resolved)],
        sizeBytes: stats.size
      };
    }

    // Fully asynchronous, non-blocking shallow directory scan (max depth 4, max 25 files)
    const matchedFiles: string[] = [];
    const ignoredDirs = new Set(['node_modules', '.git', '.cache', 'dist', '.output', '.npm', '.Trash', 'workspaces', 'scratch']);

    const scanDirAsync = async (dir: string, depth = 0): Promise<void> => {
      if (depth > 4 || matchedFiles.length >= 25) return;
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (matchedFiles.length >= 25) break;
          if (ignoredDirs.has(e.name)) continue;
          if (e.name.startsWith('.') && e.name !== '.system_generated' && e.name !== '.claude' && e.name !== '.gemini' && e.name !== '.codex') continue;

          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            await scanDirAsync(full, depth + 1);
          } else if (e.isFile()) {
            const lower = e.name.toLowerCase();
            if (
              lower.endsWith('.jsonl') || 
              lower.endsWith('.log') || 
              lower.endsWith('.sqlite') || 
              lower.endsWith('.db') || 
              lower.endsWith('.sqlite3') || 
              lower.endsWith('.vscdb') || 
              lower === 'stats-cache.json' || 
              (dir.includes('sessions') && lower.endsWith('.json'))
            ) {
              matchedFiles.push(full);
            }
          }
        }
      } catch {}
    };

    await scanDirAsync(resolved);

    const inferred = inferParser(resolved, matchedFiles);

    if (matchedFiles.length === 0) {
      return {
        valid: true,
        exists: true,
        isDirectory: true,
        resolvedPath: resolved,
        detectedParser: inferred.parser,
        detectedParserLabel: inferred.label,
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
      detectedParser: inferred.parser,
      detectedParserLabel: inferred.label,
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
