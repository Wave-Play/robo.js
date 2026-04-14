---
'robo.js': minor
---

feat(cli): AI coding skills system

`robo add` now detects and installs AI coding skills bundled with plugins. New `--no-skills` flag to skip skill installation. Skills are scanned from plugin `skills/` directories and installed to the project's `.claude/` or equivalent coding tool target.
