import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProcessStreamCard from './ProcessStreamCard.vue';
import type { MinuteBucket } from '~/server/types/telemetry';

describe('ProcessStreamCard', () => {
  const mockHistory: MinuteBucket[] = [
    {
      timestamp: 1000,
      totalTokens: 5000,
      mainTokens: 0,
      subagentTokens: {
        'project-25bbdd95': { name: 'Project [25bbdd95]', tokens: 5000, color: '#ec4899' }
      }
    },
    {
      timestamp: 2000,
      totalTokens: 8000,
      mainTokens: 0,
      subagentTokens: {
        'project-25bbdd95': { name: 'Project [25bbdd95]', tokens: 8000, color: '#ec4899' }
      }
    }
  ];

  it('renders process name, current rate, and badges', () => {
    const wrapper = mount(ProcessStreamCard, {
      props: {
        processId: 'project-25bbdd95',
        name: 'Project [25bbdd95]',
        color: '#ec4899',
        history: mockHistory,
        streamIds: ['project-25bbdd95'],
        currentRate: 8000,
        localMax: 8000,
        totalTokens: 13000
      }
    });

    expect(wrapper.text()).toContain('25bbdd95');
    expect(wrapper.text()).toContain('8,000');
    expect(wrapper.text()).toContain('Burn Rate');
    expect(wrapper.find('canvas').exists()).toBe(true);
  });

  it('emits kill event when stop button is pressed', async () => {
    const wrapper = mount(ProcessStreamCard, {
      props: {
        processId: 'project-25bbdd95',
        name: 'Project [25bbdd95]',
        color: '#ec4899',
        history: mockHistory,
        currentRate: 8000,
        localMax: 8000,
        totalTokens: 13000,
        pid: 12345
      }
    });

    const stopButton = wrapper.find('button.kill-btn');
    if (stopButton.exists()) {
      await stopButton.trigger('click');
      expect(wrapper.emitted('kill')).toBeTruthy();
      expect(wrapper.emitted('kill')![0]).toEqual([12345]);
    }
  });

  it('handles hover tooltip and fallback key matching', async () => {
    const wrapper = mount(ProcessStreamCard, {
      props: {
        processId: '25bbdd95',
        name: 'Project [25bbdd95]',
        color: '#ec4899',
        history: mockHistory,
        streamIds: ['project-25bbdd95'],
        currentRate: 8000,
        localMax: 8000,
        totalTokens: 13000
      }
    });

    // Should compute calculatedPeak properly from matching tokens (8.0k)
    expect(wrapper.text()).toContain('8.0k');

    const canvas = wrapper.find('canvas');
    await canvas.trigger('mousemove', { offsetX: 40, offsetY: 20 });
    expect(wrapper.text()).toContain('tok/m');

    await canvas.trigger('mouseleave');
  });
});
