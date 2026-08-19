import { defineStore } from 'pinia';
import type { AgentTelemetrySnapshot, AppConfig } from '~/server/types/telemetry';
import { useToast } from '~/composables/useToast';

export const useTelemetryStore = defineStore('telemetry', {
  state: () => ({
    snapshots: [] as AgentTelemetrySnapshot[],
    config: null as AppConfig | null,
    columnLayout: 2 as 1 | 2 | 3 | 4,
    cardOrder: [] as string[],
    processOrders: {} as Record<string, string[]>,
    eventSource: null as EventSource | null,
    isConnected: false,
    killInProgress: {} as Record<string, boolean>
  }),

  getters: {
    activeAgents: (state) => state.snapshots.filter(s => s.status !== 'stopped'),
    getAgentById: (state) => (id: string) => state.snapshots.find(s => s.agentId === id),
    orderedSnapshots: (state): AgentTelemetrySnapshot[] => {
      if (!Array.isArray(state.snapshots) || state.snapshots.length === 0) return [];
      if (!Array.isArray(state.cardOrder) || state.cardOrder.length === 0) return state.snapshots;
      
      const orderMap = new Map(state.cardOrder.map((id, index) => [id, index]));
      return [...state.snapshots].sort((a, b) => {
        const indexA = (a && a.agentId && orderMap.has(a.agentId)) ? orderMap.get(a.agentId)! : 9999;
        const indexB = (b && b.agentId && orderMap.has(b.agentId)) ? orderMap.get(b.agentId)! : 9999;
        return indexA - indexB;
      });
    }
  },

  actions: {
    init() {
      if (process.server) return;

      // Load saved column layout
      const savedLayout = localStorage.getItem('agent_monitor_layout');
      if (savedLayout) {
        this.columnLayout = parseInt(savedLayout, 10) as 1 | 2 | 3 | 4;
      }

      // Load saved card order
      const savedOrder = localStorage.getItem('agent_monitor_order');
      if (savedOrder) {
        try {
          this.cardOrder = JSON.parse(savedOrder);
        } catch {}
      }

      // Load saved process orders
      const savedProcessOrders = localStorage.getItem('agent_monitor_process_orders');
      if (savedProcessOrders) {
        try {
          this.processOrders = JSON.parse(savedProcessOrders);
        } catch {}
      }

      this.fetchConfig();
      this.fetchInitialSnapshots();
      this.connectSSE();
    },

    async fetchInitialSnapshots() {
      try {
        const res = await $fetch<AgentTelemetrySnapshot[]>('/api/telemetry-snapshot');
        if (Array.isArray(res) && res.length > 0 && this.snapshots.length === 0) {
          if (this.config && this.config.agents) {
            const colorMap = new Map(this.config.agents.map(a => [a.id, a.color]));
            const thresholdMap = new Map(this.config.agents.map(a => [a.id, a.alertThreshold]));

            for (const item of res) {
              if (colorMap.has(item.agentId) && colorMap.get(item.agentId)) {
                item.color = colorMap.get(item.agentId)!;
              }
              if (thresholdMap.has(item.agentId) && thresholdMap.get(item.agentId) !== undefined) {
                item.alertThreshold = thresholdMap.get(item.agentId)!;
                item.isAlertBreached = item.currentRate >= item.alertThreshold;
              }
            }
          }
          this.snapshots = res;
        }
      } catch {}
    },

    setProcessOrder(agentId: string, newOrder: string[]) {
      this.processOrders = {
        ...this.processOrders,
        [agentId]: newOrder
      };
      if (process.client) {
        try {
          localStorage.setItem('agent_monitor_process_orders', JSON.stringify(this.processOrders));
        } catch {}
      }
    },

    setCardOrder(newOrder: string[]) {
      this.cardOrder = newOrder;
      if (process.client) {
        localStorage.setItem('agent_monitor_order', JSON.stringify(newOrder));
      }

      // Also persist to config.agents order if config loaded
      if (this.config && this.config.agents) {
        const orderMap = new Map(newOrder.map((id, idx) => [id, idx]));
        this.config.agents.sort((a, b) => {
          const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
          const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
          return idxA - idxB;
        });
        this.saveConfig(this.config);
      }
    },

    cleanRemovedAgentFromOrder(agentId: string) {
      this.cardOrder = this.cardOrder.filter(id => id !== agentId);
      if (process.client) {
        localStorage.setItem('agent_monitor_order', JSON.stringify(this.cardOrder));
      }
    },

    setColumnLayout(cols: 1 | 2 | 3 | 4) {
      this.columnLayout = cols;
      if (process.client) {
        localStorage.setItem('agent_monitor_layout', cols.toString());
      }
    },

    async fetchConfig() {
      if (typeof $fetch === 'undefined') return;
      try {
        const data = await $fetch<AppConfig>('/api/config');
        this.config = data;
      } catch (err) {
        console.error('Failed to fetch config:', err);
      }
    },

    async saveConfig(newConfig: AppConfig) {
      if (typeof $fetch === 'undefined') return;
      try {
        await $fetch('/api/config', {
          method: 'POST',
          body: newConfig
        });
        this.config = newConfig;
      } catch (err) {
        console.error('Failed to save config:', err);
      }
    },

    async updateAgentThreshold(agentId: string, newThreshold: number) {
      // 1. Instant local reactive snapshot update
      const snapshot = this.snapshots.find(s => s.agentId === agentId);
      if (snapshot) {
        snapshot.alertThreshold = newThreshold;
        snapshot.isAlertBreached = snapshot.currentRate >= newThreshold;
      }

      // 2. Update config and persist
      if (!this.config) {
        await this.fetchConfig();
      }
      if (!this.config) return;

      const agent = this.config.agents.find(a => a.id === agentId);
      if (agent) {
        agent.alertThreshold = newThreshold;
        await this.saveConfig(this.config);
      }
    },

    async updateAgentColor(agentId: string, newColor: string) {
      // 1. Instant local reactive snapshot update
      const snapshot = this.snapshots.find(s => s.agentId === agentId);
      if (snapshot) {
        snapshot.color = newColor;
      }

      // 2. Update config and persist
      if (!this.config) {
        await this.fetchConfig();
      }
      if (!this.config) return;

      const agent = this.config.agents.find(a => a.id === agentId);
      if (agent) {
        agent.color = newColor;
        await this.saveConfig(this.config);
      }
    },

    connectSSE() {
      if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

      if (this.eventSource) {
        this.eventSource.close();
      }

      try {
        this.eventSource = new EventSource('/api/telemetry');

        this.eventSource.onopen = () => {
          this.isConnected = true;
        };

        this.eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as AgentTelemetrySnapshot[];
            if (Array.isArray(data)) {
              if (this.config && this.config.agents) {
                const colorMap = new Map(this.config.agents.map(a => [a.id, a.color]));
                const thresholdMap = new Map(this.config.agents.map(a => [a.id, a.alertThreshold]));

                for (const item of data) {
                  if (colorMap.has(item.agentId) && colorMap.get(item.agentId)) {
                    item.color = colorMap.get(item.agentId)!;
                  }
                  if (thresholdMap.has(item.agentId) && thresholdMap.get(item.agentId) !== undefined) {
                    item.alertThreshold = thresholdMap.get(item.agentId)!;
                    item.isAlertBreached = item.currentRate >= item.alertThreshold;
                  }
                }
              }
              this.snapshots = data;
            }
          } catch (err) {
            console.error('Error parsing telemetry stream:', err);
          }
        };

        this.eventSource.onerror = () => {
          this.isConnected = false;
        };
      } catch (err) {
        console.error('Failed to initialize EventSource:', err);
      }
    },

    async triggerEmergencyStop(agentId: string, targetPid?: number) {
      const key = targetPid ? `sub-${targetPid}` : agentId;
      this.killInProgress[key] = true;

      try {
        await $fetch('/api/kill', {
          method: 'POST',
          body: { agentId, targetPid }
        });
        useToast().success(
          targetPid ? `Subagent PID ${targetPid} terminated` : `Emergency stop dispatched for ${agentId}`,
          'Process Stopped'
        );
      } catch (err: any) {
        useToast().error(err?.data?.statusMessage || 'Failed to stop process', 'Kill Error');
      } finally {
        this.killInProgress[key] = false;
      }
    }
  }
});
