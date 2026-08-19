import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProviderStatuses } from './provider-status.get';

describe('Provider Status API Handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and structures provider statuses with fallbacks', async () => {
    const result = await fetchProviderStatuses();
    expect(result).toHaveProperty('providers');
    expect(Array.isArray(result.providers)).toBe(true);
    expect(result.providers.length).toBeGreaterThanOrEqual(2);

    const claude = result.providers.find(p => p.url.includes('claude') || p.id === 'claude');
    expect(claude).toBeDefined();
    expect(claude?.url).toBe('https://status.claude.com');

    const openai = result.providers.find(p => p.url.includes('openai') || p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.url).toBe('https://status.openai.com');
  });
});
