import { expect, mock, test } from 'claude-code/testing'
import type { AgentSpawnInput, On, TurnCompleteInput } from 'claude-code'
import type { Engine } from 'claude-code/testing'

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

const SURFACES = ['terminal', 'desktop'] as const

const answerSessionStart = (on: On): void => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', ($, e) => ({ model: 'claude-test', agentId: `agent-${e.description.split(' ')[0]}` }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
}

const startSession = async ($: Engine, on: On): Promise<void> => {
  mock.clock(on)
  answerSessionStart(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

// The agent id the test's spawn hook answers is `agent-` and the first word of the description.
const spawnAgent = async ($: Engine, description: string, overrides: Partial<AgentSpawnInput> = {}) =>
  $.agent.spawn({
    tool_use_id: `toolu-${description}`,
    prompt: `Do this: ${description}`,
    description,
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-parent',
    background: false,
    fork: false,
    ...overrides,
  })

const completeTurn = async ($: Engine, agentId: string | undefined, reason: 'answer' | 'error', answer: string) => {
  const turnComplete: TurnCompleteInput = {
    answer,
    durationMs: 1000,
    isAborted: false,
    turnId: 'turn-1',
    agentId,
    reason,
  }

  return $.turn.complete(turnComplete)
}

const runStep = async ($: Engine, agentId: string | undefined): Promise<void> => {
  const stepStream = $.turn.step({ turnId: 'turn-1', index: 0, model: 'claude-test', messageCount: 1, agentId })
  for await (const chunk of stepStream) {
    void chunk
  }
}

test('the pane says no subagents yet when there are none', async ($, on) => {
  await startSession($, on)

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    expect(await pane.find({ type: 'Text', text: /^No subagents yet\./ })).toBeDefined()
    expect((await pane.find({ type: 'Text', text: /running \// }))?.text).toBe('0 running / 0 done / 0 failed')
    await pane.unmount()
  }
})

test('a spawn creates a running card', async ($, on) => {
  await startSession($, on)
  const spawnResult = await spawnAgent($, 'Search the repo')
  expect(spawnResult.agentId).toBe('agent-Search')

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    expect(await pane.find({ type: 'Text', text: '● Search the repo Explore · claude-test' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '00:00  steps 0  tools 0' })).toBeDefined()
    expect((await pane.find({ type: 'Text', text: /running \// }))?.text).toBe('1 running / 0 done / 0 failed')
    expect(await pane.find({ type: 'Text', text: /^No subagents yet\./ })).toBeUndefined()
    await pane.unmount()
  }
})

test('a tool call in the agent loop counts and shows the last tool', async ($, on) => {
  await startSession($, on)
  await spawnAgent($, 'Search the repo', { background: true })
  const bashCall = { tool: 'Bash' as const, command: 'git log --oneline\n  | head', agentId: 'agent-Search' }
  await $.tool.call(bashCall)

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    expect(await pane.find({ type: 'Text', text: '00:00  steps 0  tools 1  bg' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '▸ Bash: git log --oneline | head' })).toBeDefined()
    await pane.unmount()
  }
})

test('a model step in the agent loop counts and elapsed time ticks while running', async ($, on) => {
  const clock = mock.clock(on)
  answerSessionStart(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await spawnAgent($, 'Search the repo')
  await runStep($, 'agent-Search')
  await runStep($, 'agent-Search')
  await clock.advance(65_000)

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    expect(await pane.find({ type: 'Text', text: '01:05  steps 2  tools 0' })).toBeDefined()
    await pane.unmount()
  }
})

test('a turn complete with an answer marks the card completed and shows the answer', async ($, on) => {
  await startSession($, on)
  await spawnAgent($, 'Search the repo')
  await completeTurn($, 'agent-Search', 'answer', 'Found three files.\n\nhooks/register.tsx\nREADME.md')

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    expect(await pane.find({ type: 'Text', text: /^✔ Search the repo/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Found three files.' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'hooks/register.tsx' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'README.md' })).toBeUndefined()
    expect((await pane.find({ type: 'Text', text: /running \// }))?.text).toBe('0 running / 1 done / 0 failed')
    await pane.unmount()
  }
})

test('a turn complete with an error marks the card failed', async ($, on) => {
  await startSession($, on)
  await spawnAgent($, 'Search the repo')
  await completeTurn($, 'agent-Search', 'error', '')

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    expect(await pane.find({ type: 'Text', text: /^✖ Search the repo/ })).toBeDefined()
    expect((await pane.find({ type: 'Text', text: /running \// }))?.text).toBe('0 running / 0 done / 1 failed')
    await pane.unmount()
  }
})

test('a child spawn is drawn nested under its parent', async ($, on) => {
  await startSession($, on)
  await spawnAgent($, 'Parent task')
  await spawnAgent($, 'Other task')
  await spawnAgent($, 'Child task', { parentAgentId: 'agent-Parent' })

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    const titleLines = await pane.findAll({ type: 'Text', text: /^● / })
    expect(titleLines.map(titleLine => titleLine.text)).toEqual([
      '● Parent task Explore · claude-test',
      '● Child task Explore · claude-test',
      '● Other task Explore · claude-test',
    ])
    const cardBoxes = await pane.findAll({ type: 'Box', text: /^● Child task/ })
    expect(cardBoxes.at(-1)?.props).toMatchObject({ marginLeft: 2 })
    await pane.unmount()
  }
})

test('/agent-board clear removes finished records and keeps running ones', async ($, on) => {
  await startSession($, on)
  await spawnAgent($, 'Finished task')
  await spawnAgent($, 'Running task')
  await completeTurn($, 'agent-Finished', 'answer', 'Done.')

  const commandResult = await $.command.run({
    command: 'agent-board',
    args: 'clear',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  expect(commandResult.text).toBe('Cleared 1 finished agent from the board.')

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    expect(await pane.find({ type: 'Text', text: /Finished task/ })).toBeUndefined()
    expect(await pane.find({ type: 'Text', text: /^● Running task/ })).toBeDefined()
    await pane.unmount()
  }
})

test('events of an unknown or absent agent id are ignored', async ($, on) => {
  await startSession($, on)
  await spawnAgent($, 'Search the repo')
  const unknownAgentCall = { tool: 'Bash' as const, command: 'ls', agentId: 'agent-unknown' }
  await $.tool.call(unknownAgentCall)
  await $.tool.call({ tool: 'Bash' as const, command: 'ls' })
  await runStep($, 'agent-unknown')
  await runStep($, undefined)
  await completeTurn($, 'agent-unknown', 'answer', 'Unrelated.')
  await completeTurn($, undefined, 'answer', 'Main loop answer.')

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    expect(await pane.find({ type: 'Text', text: '00:00  steps 0  tools 0' })).toBeDefined()
    expect((await pane.find({ type: 'Text', text: /running \// }))?.text).toBe('1 running / 0 done / 0 failed')
    expect(await pane.findAll({ type: 'Text', text: /^● / })).toHaveLength(1)
    await pane.unmount()
  }
})
