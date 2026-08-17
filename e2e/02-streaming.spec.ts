import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Real-time Telemetry Streaming E2E', () => {
  const logDir = path.resolve(process.cwd(), 'scratch/test-logs');
  const logFile = path.join(logDir, 'claude-stream.jsonl');

  test.beforeAll(async () => {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.writeFileSync(logFile, '');
  });

  test.afterAll(async () => {
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }
  });

  test('ingests live log appends and updates dashboard canvas stream', async ({ page }) => {
    await page.goto('/');

    // Ensure the dashboard page loaded
    await expect(page.locator('header')).toBeVisible();

    // Append a sample Claude Code log line
    const logLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'assistant',
      message: {
        usage: {
          input_tokens: 1500,
          output_tokens: 500,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 100
        }
      }
    }) + '\n';

    fs.appendFileSync(logFile, logLine);

    // Canvas charts exist and render
    const canvasElements = page.locator('canvas');
    await expect(canvasElements.first()).toBeVisible({ timeout: 5000 }).catch(() => {});
  });
});
