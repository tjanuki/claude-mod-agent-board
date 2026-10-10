# agent-board

A Claude Code mod (hooks module) that opens a docked pane showing the subagents of the
current session as cards, tracked from the `agent.spawn`, `tool.call`, `turn.step` and
`turn.complete` events.

The header counts running / done / failed agents. Each card shows the status glyph, the
task description, the agent type and model, the elapsed time, the number of model steps
and tool calls (and `bg` for a background agent). A running card shows the last tool call;
a finished card shows the first lines of the agent's answer. Child agents are nested under
the agent that spawned them.

Run it in a session: `claude --plugin-dir /path/to/claude-agent-board`, then:

- `/agent-board` opens the pane (it also opens on its own at session start).
- `/agent-board clear` removes every finished agent from the board and keeps running ones.

Validate: `claude plugin validate .`
Test: `claude plugin test .`
