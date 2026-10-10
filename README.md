# agent-board

A Claude Code mod (hooks module) that opens a docked pane showing the subagents of the
current session as cards, tracked from the `agent.spawn`, `tool.call`, `turn.step` and
`turn.complete` events. Useful when a parent session orchestrates several subagents and the
default one-line status is not enough.

The header counts running / done / failed agents. Each card shows the status glyph, the
task description, the agent type and model, the elapsed time, the number of model steps
and tool calls (and `bg` for a background agent). A running card shows the last tool call;
a finished card shows the first lines of the agent's answer. Child agents are nested under
the agent that spawned them.

## Install

Requires a Claude Code build with mod support (`claude plugin validate` must exist).

Clone the repo anywhere, then either load it for one session:

```
claude --plugin-dir /path/to/claude-mod-agent-board
```

or load it in every session by adding the path to the `env` block of
`~/.claude/settings.json` (several paths are separated with `:` on macOS and Linux):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-mod-agent-board"
  }
}
```

The folder is watched, so edits reload the mod at the end of the current turn.

## Use

- `/agent-board` opens the pane. It also opens on its own at session start, but an unasked
  pane only docks in terminals wider than about 144 columns; after you open it once it docks
  from 110.
- `/agent-board clear` removes every finished agent from the board and keeps running ones.

## Develop

- Validate: `claude plugin validate .`
- Type-check: `tsc -p .` (the engine writes `.claude-plugin/types/` on first load)
- Test: `claude plugin test .`
