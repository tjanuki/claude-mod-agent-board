# agent-board

A Claude Code mod (hooks module) that opens a docked pane listing the subagents of the
current session, with each agent's task description, type and status.

Run it in a session: `claude --plugin-dir /path/to/claude-agent-board`, then `/agent-board`
opens the pane (it also opens on its own on terminals of 144 columns or more).

Validate: `claude plugin validate .`
Test: `claude plugin test .`
