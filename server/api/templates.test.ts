import { describe, it, expect } from 'vitest';
import { getAgentTemplates, DEFAULT_TEMPLATES } from './templates.get';

describe('Agent Templates Configuration', () => {
  it('loads templates from templates.json or returns default presets', () => {
    const templates = getAgentTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThanOrEqual(4);

    const claude = templates.find(t => t.id === 'claude');
    expect(claude).toBeDefined();
    expect(claude?.statusUrl).toBe('https://status.claude.com');

    const codegpt = templates.find(t => t.id === 'codegpt');
    expect(codegpt).toBeDefined();
    expect(codegpt?.parser).toBe('sqlite-db');
  });
});
