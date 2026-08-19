import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type { LogAdapter } from './types';
import type { CanonicalTelemetryFrame, AgentConfig } from '../../types/telemetry';

const execAsync = promisify(exec);

export class SqliteAdapter implements LogAdapter {
  private lastRowIds: Map<string, number> = new Map();
  private execFn: (cmd: string, opts?: any) => Promise<{ stdout: string; stderr: string }>;

  constructor(execFn: (cmd: string, opts?: any) => Promise<{ stdout: string; stderr: string }> = execAsync) {
    this.execFn = execFn;
  }

  public reset(): void {
    this.lastRowIds.clear();
  }

  /**
   * Dummy implementation to satisfy LogAdapter interface for text chunks
   */
  public parseChunk(content: string, config: AgentConfig, filePath?: string): CanonicalTelemetryFrame[] {
    return [];
  }

  /**
   * Reads new token events from an SQLite database file
   */
  public async parseDatabase(dbPath: string, config: AgentConfig): Promise<CanonicalTelemetryFrame[]> {
    if (!fs.existsSync(dbPath)) return [];

    try {
      const lastRowId = this.lastRowIds.get(dbPath) || 0;
      
      // Query table list via sqlite3 CLI
      const { stdout: tablesOut } = await this.execFn(`sqlite3 "${dbPath}" ".tables"`, { timeout: 2000 });
      const tables = tablesOut.trim().split(/\s+/).filter(t => t && !t.startsWith('sqlite_'));
      if (tables.length === 0) return [];

      const targetTable = tables.find(t => 
        t.toLowerCase().includes('message') || 
        t.toLowerCase().includes('history') || 
        t.toLowerCase().includes('chat') || 
        t.toLowerCase().includes('token') || 
        t.toLowerCase().includes('session')
      ) || tables[0];

      // Query table schema columns
      const { stdout: schemaOut } = await this.execFn(`sqlite3 "${dbPath}" "PRAGMA table_info(${targetTable});"`, { timeout: 2000 });
      const cols = schemaOut.trim().split('\n').map(line => {
        const parts = line.split('|');
        return parts[1] ? parts[1].toLowerCase() : '';
      });

      const timeCol = cols.find(c => c.includes('time') || c.includes('created') || c.includes('date')) || 'rowid';
      const promptCol = cols.find(c => c.includes('prompt_token') || c.includes('input_token') || c.includes('prompt')) || null;
      const compCol = cols.find(c => c.includes('completion_token') || c.includes('output_token') || c.includes('completion')) || null;
      const totalCol = cols.find(c => c.includes('total_token') || c.includes('token') || c.includes('usage')) || null;
      const sessionCol = cols.find(c => c.includes('session') || c.includes('conversation') || c.includes('chat_id') || c.includes('thread')) || null;

      const selectCols = ['rowid'];
      selectCols.push(timeCol);
      selectCols.push(promptCol || "0");
      selectCols.push(compCol || "0");
      selectCols.push(totalCol || "0");
      selectCols.push(sessionCol || "''");

      const query = `SELECT ${selectCols.join(', ')} FROM ${targetTable} WHERE rowid > ${lastRowId} ORDER BY rowid ASC LIMIT 100;`;
      const { stdout: rowsOut } = await this.execFn(`sqlite3 -separator '|' "${dbPath}" "${query}"`, { timeout: 2000 });

      const lines = rowsOut.trim().split('\n').filter(l => l.trim().length > 0);
      const frames: CanonicalTelemetryFrame[] = [];
      let maxRowIdSeen = lastRowId;

      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length < 5) continue;

        const rowId = parseInt(parts[0], 10) || 0;
        maxRowIdSeen = Math.max(maxRowIdSeen, rowId);

        let rowTime = Date.now();
        const rawTime = parts[1];
        if (rawTime) {
          const parsed = !isNaN(Number(rawTime)) ? Number(rawTime) : new Date(rawTime).getTime();
          if (!isNaN(parsed)) {
            rowTime = parsed < 10000000000 ? parsed * 1000 : parsed;
          }
        }

        const inputTokens = parseInt(parts[2], 10) || 0;
        const outputTokens = parseInt(parts[3], 10) || 0;
        let totalTokens = parseInt(parts[4], 10) || (inputTokens + outputTokens);
        if (totalTokens <= 0 && (inputTokens > 0 || outputTokens > 0)) {
          totalTokens = inputTokens + outputTokens;
        }

        if (totalTokens <= 0) continue;

        const subagentId = parts[5] && parts[5].trim().length > 0 ? parts[5].trim() : path.basename(dbPath, path.extname(dbPath));

        frames.push({
          agentId: config.id,
          agentName: config.name,
          subagentId,
          subagentName: subagentId,
          timestamp: rowTime,
          inputTokens,
          outputTokens,
          totalTokens,
          status: 'active'
        });
      }

      this.lastRowIds.set(dbPath, maxRowIdSeen);
      return frames;
    } catch {
      return [];
    }
  }
}
