import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRecord, AgentStatus } from '../types'

const PANE = 'agent-board'
const PANE_TITLE = 'Agent board'
const TICK_MS = 1000
const PROMPT_LIMIT = 400
const ANSWER_LIMIT = 600
const ANSWER_LINE_LIMIT = 160
const BASH_SUMMARY_LIMIT = 80
const INDENT_COLUMNS = 2

const agents = atom({ plugin: 'agent-board', key: 'agents' } as const, {})
const now = atom({ plugin: 'agent-board', key: 'now' } as const, 0)

const STATUS_GLYPHS: Record<AgentStatus, string> = {
  running: '●',
  completed: '✔',
  failed: '✖',
  aborted: '■',
}

const STATUS_COLORS: Record<AgentStatus, string> = {
  running: 'claude',
  completed: 'success',
  failed: 'error',
  aborted: 'warning',
}

const toSingleLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

const cutToWidth = (text: string, width: number): string => {
  if (width <= 0) {
    return ''
  }

  return text.length <= width ? text : `${text.slice(0, width - 1)}…`
}

const formatElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

const summarizeToolInput = (toolName: string, toolInput: Readonly<Record<string, unknown>>): string => {
  const readField = (fieldName: string): string => {
    const fieldValue = toolInput[fieldName]

    return typeof fieldValue === 'string' ? toSingleLine(fieldValue) : ''
  }

  switch (toolName) {
    case 'Bash':
      return readField('command').slice(0, BASH_SUMMARY_LIMIT)
    case 'Read':
    case 'Write':
    case 'Edit':
      return readField('file_path')
    case 'Grep':
    case 'Glob':
      return readField('pattern')
    case 'Agent':
      return readField('description')
    default:
      return toolName
  }
}

const statusFromReason = (reason: string): AgentStatus => {
  if (reason === 'answer') {
    return 'completed'
  }

  return reason === 'aborted' ? 'aborted' : 'failed'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-board',
      description: 'Open the agent board pane',
      argumentHint: '[clear]',
    })

    // Elapsed times tick from `now`; it is written only while an agent runs,
    // so an idle board is never redrawn.
    $.clock.every(TICK_MS, async () => {
      const agentRecords = await read($, agents)
      const hasRunningAgent = Object.values(agentRecords).some(agentRecord => agentRecord.status === 'running')
      if (hasRunningAgent) {
        const currentTime = await $.clock.now()
        await update($, now, () => currentTime)
      }
    })
    void $.ui.open({ id: PANE, title: PANE_TITLE })

    return next(e)
  })

  on('command.run', { command: 'agent-board' }, async ($, e) => {
    if (e.args.trim() === 'clear') {
      const agentRecords = await read($, agents)
      const finishedCount = Object.values(agentRecords).filter(agentRecord => agentRecord.status !== 'running').length
      await update($, agents, records =>
        Object.fromEntries(Object.entries(records).filter(([, agentRecord]) => agentRecord.status === 'running')),
      )

      return { text: `Cleared ${finishedCount} finished agent${finishedCount === 1 ? '' : 's'} from the board.` }
    }

    await $.ui.open({ id: PANE, title: PANE_TITLE })

    return { text: 'Agent board pane opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const agentId = result.agentId
    if (agentId === undefined) {
      return result
    }

    const startedAt = await $.clock.now()
    const agentRecord: AgentRecord = {
      id: agentId,
      description: e.description,
      type: e.subagentType,
      model: result.model,
      parentId: e.parentAgentId,
      isBackground: e.background,
      prompt: e.prompt.slice(0, PROMPT_LIMIT),
      status: 'running',
      startedAt,
      stepCount: 0,
      toolCount: 0,
    }
    await update($, agents, records => ({ ...records, [agentId]: agentRecord }))

    return result
  })

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined && (await read($, agents))[agentId] !== undefined) {
      const toolName = String(e.tool)
      const toolInput: Readonly<Record<string, unknown>> = e
      const calledAt = await $.clock.now()
      await update($, agents, records => {
        const agentRecord = records[agentId]
        if (agentRecord === undefined) {
          return records
        }

        return {
          ...records,
          [agentId]: {
            ...agentRecord,
            toolCount: agentRecord.toolCount + 1,
            lastTool: { tool: toolName, summary: summarizeToolInput(toolName, toolInput), at: calledAt },
          },
        }
      })
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    if (agentId !== undefined && (await read($, agents))[agentId] !== undefined) {
      await update($, agents, records => {
        const agentRecord = records[agentId]

        return agentRecord === undefined
          ? records
          : { ...records, [agentId]: { ...agentRecord, stepCount: agentRecord.stepCount + 1 } }
      })
    }

    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined && (await read($, agents))[agentId] !== undefined) {
      const endedAt = await $.clock.now()
      await update($, agents, records => {
        const agentRecord = records[agentId]
        if (agentRecord === undefined) {
          return records
        }

        return {
          ...records,
          [agentId]: {
            ...agentRecord,
            status: statusFromReason(e.reason),
            endedAt,
            answer: e.answer.slice(0, ANSWER_LIMIT),
            reason: e.reason,
          },
        }
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const agentRecords = await read($, agents)
    const currentTime = await read($, now)
    const bodyColumns = e.props.bodyColumns

    const allRecords = Object.values(agentRecords).sort((first, second) => first.startedAt - second.startedAt)
    const childrenByParentId = new Map<string, AgentRecord[]>()
    for (const agentRecord of allRecords) {
      if (agentRecord.parentId !== undefined && agentRecords[agentRecord.parentId] !== undefined) {
        const siblings = childrenByParentId.get(agentRecord.parentId) ?? []
        siblings.push(agentRecord)
        childrenByParentId.set(agentRecord.parentId, siblings)
      }
    }
    const topLevelRecords = allRecords.filter(
      agentRecord => agentRecord.parentId === undefined || agentRecords[agentRecord.parentId] === undefined,
    )

    const orderedCards: { agentRecord: AgentRecord; depth: number }[] = []
    const addCard = (agentRecord: AgentRecord, depth: number): void => {
      orderedCards.push({ agentRecord, depth })
      for (const childRecord of childrenByParentId.get(agentRecord.id) ?? []) {
        addCard(childRecord, depth + 1)
      }
    }
    for (const agentRecord of topLevelRecords) {
      addCard(agentRecord, 0)
    }

    const runningCount = allRecords.filter(agentRecord => agentRecord.status === 'running').length
    const completedCount = allRecords.filter(agentRecord => agentRecord.status === 'completed').length
    const failedCount = allRecords.length - runningCount - completedCount

    const renderCard = (agentRecord: AgentRecord, depth: number) => {
      const indentColumns = depth * INDENT_COLUMNS
      const lineWidth = bodyColumns - indentColumns
      const description = cutToWidth(toSingleLine(agentRecord.description), lineWidth - 2)
      const typeAndModel = [agentRecord.type, agentRecord.model].filter(Boolean).join(' · ')
      const typeAndModelText = cutToWidth(typeAndModel, lineWidth - 2 - description.length - 1)

      const elapsedMs = (agentRecord.endedAt ?? Math.max(currentTime, agentRecord.startedAt)) - agentRecord.startedAt
      const statsParts = [
        formatElapsed(elapsedMs),
        `steps ${agentRecord.stepCount}`,
        `tools ${agentRecord.toolCount}`,
        ...(agentRecord.isBackground ? ['bg'] : []),
      ]

      let detailLines: string[] = []
      if (agentRecord.status === 'running') {
        const lastTool = agentRecord.lastTool
        if (lastTool !== undefined) {
          const toolLine = lastTool.summary === lastTool.tool ? lastTool.tool : `${lastTool.tool}: ${lastTool.summary}`
          detailLines = [`▸ ${toolLine}`]
        }
      } else {
        detailLines = (agentRecord.answer ?? '')
          .split('\n')
          .map(toSingleLine)
          .filter(answerLine => answerLine !== '')
          .slice(0, 2)
          .map(answerLine => cutToWidth(answerLine, ANSWER_LINE_LIMIT))
      }

      return (
        <Box flexDirection="column" marginLeft={indentColumns} marginTop={1}>
          <Text>
            <Text color={STATUS_COLORS[agentRecord.status]}>{STATUS_GLYPHS[agentRecord.status]}</Text>{' '}
            <Text bold>{description}</Text>
            {typeAndModelText !== '' && <Text dimColor> {typeAndModelText}</Text>}
          </Text>
          <Text>{cutToWidth(statsParts.join('  '), lineWidth)}</Text>
          {detailLines.map(detailLine => (
            <Text dimColor>{cutToWidth(detailLine, lineWidth)}</Text>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text bold>{cutToWidth(`${runningCount} running / ${completedCount} done / ${failedCount} failed`, bodyColumns)}</Text>
        {orderedCards.length === 0 && (
          <Text dimColor>No subagents yet. They appear here when the Agent tool spawns one.</Text>
        )}
        {orderedCards.map(card => renderCard(card.agentRecord, card.depth))}
      </Box>
    )
  })
}
