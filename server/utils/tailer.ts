import fs from 'node:fs';
import readline from 'node:readline';

export class FileTailer {
  private filePath: string;
  private byteOffset: number = 0;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public getByteOffset(): number {
    return this.byteOffset;
  }

  /**
   * Streams newly appended lines from disk without buffering the entire file into memory.
   */
  public async streamNewLines(onLine: (line: string) => void): Promise<number> {
    if (!fs.existsSync(this.filePath)) {
      return 0;
    }

    try {
      const stats = fs.statSync(this.filePath);
      const currentSize = stats.size;

      // Handle file truncation / log rotation
      if (currentSize < this.byteOffset) {
        this.byteOffset = 0;
      }

      if (currentSize === this.byteOffset) {
        return 0;
      }

      const stream = fs.createReadStream(this.filePath, {
        start: this.byteOffset,
        encoding: 'utf-8'
      });

      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      let lineCount = 0;
      try {
        for await (const line of rl) {
          if (line.trim()) {
            onLine(line);
            lineCount++;
          }
        }
      } finally {
        rl.close();
        stream.destroy();
      }

      this.byteOffset = currentSize;
      return lineCount;
    } catch {
      return 0;
    }
  }

  public async readNewBytes(): Promise<string> {
    if (!fs.existsSync(this.filePath)) {
      return '';
    }

    try {
      const stats = fs.statSync(this.filePath);
      const currentSize = stats.size;

      if (currentSize < this.byteOffset) {
        this.byteOffset = 0;
      }

      // Cap initial read on exceptionally huge files (> 2MB)
      if (this.byteOffset === 0 && currentSize > 2 * 1024 * 1024) {
        this.byteOffset = currentSize - (2 * 1024 * 1024);
      }

      if (currentSize === this.byteOffset) {
        return '';
      }

      const bytesToRead = currentSize - this.byteOffset;
      const buffer = Buffer.alloc(bytesToRead);
      const fd = fs.openSync(this.filePath, 'r');

      try {
        fs.readSync(fd, buffer, 0, bytesToRead, this.byteOffset);

        // Atomically advance only up to the last complete newline to guarantee zero split JSON lines
        const lastNewlineIdx = buffer.lastIndexOf(0x0a);
        if (lastNewlineIdx === -1) {
          return '';
        }

        const validBytes = lastNewlineIdx + 1;
        this.byteOffset += validBytes;
        return buffer.subarray(0, validBytes).toString('utf-8');
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return '';
    }
  }
}
