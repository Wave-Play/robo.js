---
'robo.js': minor
---

feat(cli): interactive terminal for dev mode

New split-pane terminal UI during `robo dev` with ANSI scroll regions: log output in the top area and a pinned input area at the bottom. Features character-by-character stdin handling, command history with arrow key navigation, real-time hints/autocomplete, resize handling, and graceful degradation for non-TTY environments. Disable with `ROBO_NON_INTERACTIVE=true`. Terminal commands registered by plugins appear in the interactive prompt.
