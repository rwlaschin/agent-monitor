import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileTailer } from './tailer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('FileTailer', () => {
  let tmpDir: string;
  let testFilePath: string;
  let tailer: FileTailer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailer-test-'));
    testFilePath = path.join(tmpDir, 'test.log');
    fs.writeFileSync(testFilePath, 'initial-line-1\n');
    tailer = new FileTailer(testFilePath);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('reads initial content and updates byte offset', async () => {
    const chunk = await tailer.readNewBytes();
    expect(chunk).toBe('initial-line-1\n');
    expect(tailer.getByteOffset()).toBe(15);
  });

  it('reads ONLY newly appended bytes on subsequent calls', async () => {
    // Read initial
    await tailer.readNewBytes();

    // Append new line
    fs.appendFileSync(testFilePath, 'second-line-2\n');

    const newChunk = await tailer.readNewBytes();
    expect(newChunk).toBe('second-line-2\n'); // Must NOT contain initial-line-1
    expect(tailer.getByteOffset()).toBe(29);
  });

  it('returns empty string if no new bytes were written', async () => {
    await tailer.readNewBytes();
    const emptyChunk = await tailer.readNewBytes();
    expect(emptyChunk).toBe('');
  });

  it('resets byte offset to 0 when file is truncated/reset', async () => {
    await tailer.readNewBytes(); // read 15 bytes
    fs.appendFileSync(testFilePath, 'more-data\n');
    await tailer.readNewBytes();

    fs.writeFileSync(testFilePath, 'reset\n');
    const resetChunk = await tailer.readNewBytes();
    expect(resetChunk).toBe('reset\n');
    expect(tailer.getByteOffset()).toBe(6);
  });

  it('safely bounds initial read on huge files to prevent memory exhaustion', async () => {
    const hugeFile = path.join(tmpDir, 'huge.log');
    // Write 3MB file
    const largeContent = 'X'.repeat(3 * 1024 * 1024) + '\nrecent-line\n';
    fs.writeFileSync(hugeFile, largeContent);

    const hugeTailer = new FileTailer(hugeFile);
    const chunk = await hugeTailer.readNewBytes();
    expect(chunk.length).toBeLessThanOrEqual(2.1 * 1024 * 1024);
    expect(chunk).toContain('recent-line');
  });
});
