import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AgentCard from './AgentCard.vue';
import type { AgentTelemetrySnapshot } from '~/server/types/telemetry';

describe('AgentCard', () => {
  const mockSnapshot: AgentTelemetrySnapshot = {
    agentId: 'claude',
    agentName: 'Claude Code',
    color: '#a855f7',
    status: 'active',
    activePid: 4892,
    currentRate: 4200,
    localMax: 11400,
    totalTokens24h: 45000,
    alertThreshold: 12000,
    isAlertBreached: false,
    history: [],
    subagents: []
  };

  it('renders agent name, PID, metrics, and emits emergency stop event on click', async () => {
    const wrapper = mount(AgentCard, {
      props: {
        snapshot: mockSnapshot,
        isKilling: false
      },
      global: {
        stubs: {
          NuxtLink: { template: '<a><slot /></a>' },
          AgentChart: { template: '<div class="agent-chart-stub"></div>' },
          SubagentTree: { template: '<div class="subagent-tree-stub"></div>' }
        }
      }
    });

    expect(wrapper.text()).toContain('Claude Code');
    expect(wrapper.text()).toContain('PID: 4892');
    expect(wrapper.text()).toContain('4,200');
    expect(wrapper.text()).toContain('11,400');

    // Click Stop Agent
    const killBtn = wrapper.findAll('button').find(b => b.text().includes('STOP AGENT') || b.text().includes('EMERGENCY STOP'))!;
    expect(killBtn).toBeDefined();
    await killBtn.trigger('click');

    expect(wrapper.emitted('killAgent')).toBeTruthy();
    expect(wrapper.emitted('killAgent')![0]).toEqual(['claude']);
  });

  it('applies breach alert styling when isAlertBreached is true', () => {
    const breachedSnapshot = { ...mockSnapshot, isAlertBreached: true };
    const wrapper = mount(AgentCard, {
      props: {
        snapshot: breachedSnapshot,
        isKilling: false
      },
      global: {
        stubs: {
          NuxtLink: true,
          AgentChart: true,
          SubagentTree: true
        }
      }
    });

    expect(wrapper.classes()).toContain('border-red-500/80');
  });

  it('opens color picker popover and emits updateColor on preset click', async () => {
    const wrapper = mount(AgentCard, {
      props: {
        snapshot: mockSnapshot,
        isKilling: false
      },
      global: {
        stubs: {
          NuxtLink: true,
          AgentChart: true,
          SubagentTree: true
        }
      }
    });

    const colorDotBtn = wrapper.find('button[title="Click to change agent & chart color"]');
    expect(colorDotBtn.exists()).toBe(true);
    await colorDotBtn.trigger('click');

    // Color popover is opened
    expect(wrapper.text()).toContain('Chart Color');

    // Change color via hex input
    const hexInput = wrapper.find('input[title="Click to edit Hex code directly"]');
    expect(hexInput.exists()).toBe(true);
    await hexInput.setValue('#10b981');
    await hexInput.trigger('change');

    expect(wrapper.emitted('updateColor')).toBeTruthy();
    expect(wrapper.emitted('updateColor')![0][0]).toBe('claude');
    expect(wrapper.emitted('updateColor')![0][1]).toBe('#10b981');
  });

  it('opens process diagnostics popup when clicking status badge', async () => {
    const wrapper = mount(AgentCard, {
      props: {
        snapshot: mockSnapshot,
        isKilling: false
      },
      global: {
        stubs: {
          NuxtLink: true,
          AgentChart: true,
          SubagentTree: true
        }
      }
    });

    const statusBtn = wrapper.find('button[title="Click to view process telemetry diagnostics"]');
    expect(statusBtn.exists()).toBe(true);

    await statusBtn.trigger('click');
    expect(wrapper.text()).toContain('Process Diagnostics');
    expect(wrapper.text()).toContain('Active PID:');
  });

  it('opens alert threshold popover and saves updated threshold', async () => {
    const wrapper = mount(AgentCard, {
      props: {
        snapshot: mockSnapshot,
        isKilling: false
      },
      global: {
        stubs: {
          NuxtLink: true,
          AgentChart: true,
          SubagentTree: true
        }
      }
    });

    const thresholdBtn = wrapper.find('button[title="Click to edit alert threshold"]');
    expect(thresholdBtn.exists()).toBe(true);
    await thresholdBtn.trigger('click');

    expect(wrapper.text()).toContain('Alert Threshold');
    // Click 25k preset
    const presetBtn = wrapper.findAll('.grid button').find(b => b.text() === '25k')!;
    expect(presetBtn).toBeDefined();
    await presetBtn.trigger('click');

    // Click Save button
    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save')!;
    expect(saveBtn).toBeDefined();
    await saveBtn.trigger('click');

    expect(wrapper.emitted('updateThreshold')).toBeTruthy();
    expect(wrapper.emitted('updateThreshold')![0]).toEqual(['claude', 25000]);
  });
});
