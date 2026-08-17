import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SubagentTree from './SubagentTree.vue';

describe('SubagentTree', () => {
  it('sorts subagents by descending burn rate and renders individual kill triggers', async () => {
    const wrapper = mount(SubagentTree, {
      props: {
        parentColor: '#a855f7',
        subagents: [
          { id: 'sub-1', name: 'Low Burn', color: '#c084fc', currentRate: 500, pid: 1001 },
          { id: 'sub-2', name: 'High Burn', color: '#c084fc', currentRate: 8500, pid: 1002 }
        ]
      }
    });

    const items = wrapper.findAll('.font-medium');
    expect(items[0].text()).toBe('High Burn'); // Top ranked first
    expect(items[1].text()).toBe('Low Burn');

    // Click kill button on the high burn agent
    const killButtons = wrapper.findAll('button');
    await killButtons[0].trigger('click');

    expect(wrapper.emitted('killSubagent')).toBeTruthy();
    expect(wrapper.emitted('killSubagent')![0]).toEqual([1002]);
  });

  it('assigns distinct colors based on process ID / subagent ID', () => {
    const wrapper = mount(SubagentTree, {
      props: {
        parentColor: '#a855f7',
        subagents: [
          { id: '25bbdd95', name: 'Project A', color: '', currentRate: 500, pid: 2501 },
          { id: '09a9996a', name: 'Project B', color: '', currentRate: 8500, pid: 9002 }
        ]
      }
    });

    const dots = wrapper.findAll('span[style*="background-color"]');
    expect(dots.length).toBe(2);
    const color1 = dots[0].attributes('style');
    const color2 = dots[1].attributes('style');
    // Colors must be distinct and non-empty
    expect(color1).not.toEqual(color2);
  });
});
