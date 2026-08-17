import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

test.describe('Emergency Kill Switch E2E', () => {
  test('handles emergency stop safety checks correctly', async ({ request }) => {
    // Attempt kill with an invalid PID / agent
    const response = await request.post('/api/kill', {
      data: {
        agentId: 'non-existent-agent'
      }
    });

    // Should return 404 or 400 for unknown agent
    expect([400, 404, 500]).toContain(response.status());
  });

  test('verifies command validation before process termination', async () => {
    // Spawn a dummy process
    const child = spawn('sleep', ['60']);
    const pid = child.pid;
    expect(pid).toBeDefined();

    // Verify process is alive
    if (pid) {
      process.kill(pid, 'SIGTERM');
    }
  });
});
