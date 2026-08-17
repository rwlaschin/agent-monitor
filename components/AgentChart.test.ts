import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AgentChart from './AgentChart.vue';
import type { MinuteBucket } from '~/server/types/telemetry';

describe('AgentChart', () => {
  const mockHistory: MinuteBucket[] = [
    { timestamp: 1000, totalTokens: 500, mainTokens: 500, subagentTokens: {} },
    { timestamp: 2000, totalTokens: 12000, mainTokens: 12000, subagentTokens: {} },
    { timestamp: 3000, totalTokens: 300, mainTokens: 300, subagentTokens: {} }
  ];

  it('renders canvas with hex color without throwing exceptions', () => {
    const wrapper = mount(AgentChart, {
      props: {
        history: mockHistory,
        color: '#a855f7',
        alertThreshold: 10000,
        localMax: 12000
      }
    });

    expect(wrapper.find('canvas').exists()).toBe(true);
  });

  it('renders canvas with HSL color without throwing invalid color exceptions', () => {
    const wrapper = mount(AgentChart, {
      props: {
        history: mockHistory,
        color: 'hsl(180, 80%, 55%)',
        alertThreshold: 8000,
        localMax: 12000
      }
    });

    expect(wrapper.find('canvas').exists()).toBe(true);
  });

  it('handles multi-process subagent history with Top 3 and Others bands', () => {
    const multiProcessHistory: MinuteBucket[] = [
      {
        timestamp: 1000,
        totalTokens: 10000,
        mainTokens: 2000,
        subagentTokens: {
          'p-1': { name: 'Worker 1', tokens: 4000, color: 'hsl(120, 80%, 50%)' },
          'p-2': { name: 'Worker 2', tokens: 2000, color: 'hsl(200, 80%, 50%)' },
          'p-3': { name: 'Worker 3', tokens: 1500, color: 'hsl(280, 80%, 50%)' },
          'p-4': { name: 'Worker 4', tokens: 500, color: 'hsl(340, 80%, 50%)' }
        }
      }
    ];

    const wrapper = mount(AgentChart, {
      props: {
        history: multiProcessHistory,
        color: '#06b6d4',
        alertThreshold: 8000,
        localMax: 10000
      }
    });

    expect(wrapper.find('canvas').exists()).toBe(true);
    // Should render mini legend for top processes
    expect(wrapper.text()).toContain('Worker 1');
  });

  it('guarantees distinct colors for multiple active processes in the chart legend', () => {
    const multiProcessHistory: MinuteBucket[] = [
      {
        timestamp: 1000,
        totalTokens: 15000,
        mainTokens: 0,
        subagentTokens: {
          'project-25bbdd95': { name: 'Project [25bbdd95]', tokens: 7000, color: '' },
          'project-09a9996a': { name: 'Project [09a9996a]', tokens: 8000, color: '' }
        }
      }
    ];

    const wrapper = mount(AgentChart, {
      props: {
        history: multiProcessHistory,
        color: '#06b6d4',
        alertThreshold: 8000,
        localMax: 15000
      }
    });

    const legendPills = wrapper.findAll('.rounded-full');
    expect(legendPills.length).toBeGreaterThanOrEqual(2);
    const color1 = legendPills[0].attributes('style');
    const color2 = legendPills[1].attributes('style');
    expect(color1).not.toEqual(color2);
  });

  it('handles mouse hover events and displays tooltip with breakdown', async () => {
    const wrapper = mount(AgentChart, {
      props: {
        history: mockHistory,
        color: '#06b6d4',
        alertThreshold: 8000,
        localMax: 15000
      }
    });

    const canvas = wrapper.find('canvas');
    expect(canvas.exists()).toBe(true);

    // Trigger mousemove on canvas
    await canvas.trigger('mousemove', { offsetX: 50, offsetY: 50 });
    // Tooltip should be active
    expect(wrapper.find('.chart-tooltip').exists()).toBe(true);

    // Trigger mouseleave
    await canvas.trigger('mouseleave');
    expect(wrapper.find('.chart-tooltip').exists()).toBe(false);
  });

  it('isolates specific process line when hovering over its legend pill', async () => {
    const multiProcessHistory: MinuteBucket[] = [
      {
        timestamp: 1000,
        totalTokens: 10000,
        mainTokens: 0,
        subagentTokens: {
          'p-1': { name: 'Worker 1', tokens: 6000, color: '#ec4899' },
          'p-2': { name: 'Worker 2', tokens: 4000, color: '#f59e0b' }
        }
      }
    ];

    const wrapper = mount(AgentChart, {
      props: {
        history: multiProcessHistory,
        color: '#06b6d4',
        alertThreshold: 8000,
        localMax: 10000
      }
    });

    const legendButtons = wrapper.findAll('.legend-pill');
    expect(legendButtons.length).toBeGreaterThanOrEqual(2);

    // Hover over Worker 1 pill
    await legendButtons[0].trigger('mouseenter');
    expect(legendButtons[0].classes()).toContain('ring-1');

    // Leave Worker 1 pill
    await legendButtons[0].trigger('mouseleave');
    expect(legendButtons[0].classes()).not.toContain('ring-1');
  });
});
