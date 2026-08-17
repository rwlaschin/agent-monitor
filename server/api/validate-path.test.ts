import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Test the path resolution and discovery logic
function resolveHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

function inspectPath(targetPath: string) {
  const resolved = resolveHome(targetPath);
  if (!fs.existsSync(resolved)) {
    return { valid: false, exists: false, error: 'Path does not exist' };
  }
  const stats = fs.statSync(resolved);
  return { valid: true, exists: true, isDirectory: stats.isDirectory() };
}

describe('Path Validation Logic', () => {
  it('identifies non-existent paths and returns error', () => {
    const res = inspectPath('/non/existent/path/to/logs');
    expect(res.valid).toBe(false);
    expect(res.exists).toBe(false);
    expect(res.error).toBe('Path does not exist');
  });

  it('correctly resolves home directory tilde paths', () => {
    const res = inspectPath('~');
    expect(res.valid).toBe(true);
    expect(res.exists).toBe(true);
    expect(res.isDirectory).toBe(true);
  });

  it('validates workspace directories properly', () => {
    const res = inspectPath(process.cwd());
    expect(res.valid).toBe(true);
    expect(res.exists).toBe(true);
    expect(res.isDirectory).toBe(true);
  });
});
