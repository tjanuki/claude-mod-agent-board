import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow } from '../types'

const PANE = 'agent-board'
const PANE_TITLE = 'Agent board'
const REFRESH_MS = 1000

// `$.agent.list()` does not subscribe a drawing, so the pane reads an atom
// that a timer refreshes; each write redraws the pane.
const agents = atom({ plugin: 'agent-board', key: 'agents' } as const, [])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-board',
      description: 'Open the agent board pane',
    })

    const refreshAgents = async (): Promise<void> => {
      const agentList = await $.agent.list()
      const rows: AgentRow[] = agentList.map(agent => ({
        id: agent.id,
        description: agent.description,
        type: agent.type,
        status: agent.status,
      }))
      await update($, agents, () => rows)
    }

    await refreshAgents()
    $.clock.every(REFRESH_MS, () => void refreshAgents())
    void $.ui.open({ id: PANE, title: PANE_TITLE })

    return next(e)
  })

  on('command.run', { command: 'agent-board' }, async $ => {
    await $.ui.open({ id: PANE, title: PANE_TITLE })

    return { text: 'Agent board pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const agentRows = await read($, agents)

    return (
      <Box flexDirection="column">
        <Text bold>Agents</Text>
        {agentRows.length === 0 && <Text dimColor>No agents yet.</Text>}
        {agentRows.map(agentRow => (
          <Text>
            {agentRow.description} | {agentRow.type} | {agentRow.status}
          </Text>
        ))}
      </Box>
    )
  })
}
