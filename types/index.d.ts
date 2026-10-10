export type AgentStatus = 'running' | 'completed' | 'failed' | 'aborted'

export type AgentRecord = {
  id: string
  description: string
  type: string
  model?: string
  parentId?: string
  isBackground: boolean
  prompt: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  stepCount: number
  toolCount: number
  lastTool?: { tool: string; summary: string; at: number }
  answer?: string
  reason?: string
}

declare module 'claude-code' {
  interface PluginState {
    'agent-board': { agents: Record<string, AgentRecord>; now: number }
  }
}
