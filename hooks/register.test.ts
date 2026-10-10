import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

const PANE_TARGET = {
  plugin: 'agent-board',
  component: 'Pane',
  requestId: 'agent-board',
  props: {
    title: 'Agent board',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const answerSessionStart = (on: On, agentList: AgentInfo[]): void => {
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: agentList }))
}

test('the pane says no agents yet when there are none', async ($, on) => {
  answerSessionStart(on, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    expect(await pane.find({ type: 'Text', text: 'No agents yet.' })).toBeDefined()
    await pane.unmount()
  }
})

test('the pane lists each agent with its type and status', async ($, on) => {
  answerSessionStart(on, [
    { id: 'agent-1', description: 'Search the repo', type: 'Explore', status: 'running' },
  ])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    const agentRow = await pane.find({ type: 'Text', text: /Search the repo/ })
    expect(agentRow?.text).toBe('Search the repo | Explore | running')
    expect(await pane.find({ type: 'Text', text: 'No agents yet.' })).toBeUndefined()
    await pane.unmount()
  }
})
