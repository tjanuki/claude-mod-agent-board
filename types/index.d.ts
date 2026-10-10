export type AgentRow = { id: string; description: string; type: string; status: string }

declare module 'claude-code' {
  interface PluginState {
    'agent-board': { agents: AgentRow[] }
  }
}
