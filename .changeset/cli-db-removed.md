---
'robo.js': minor
---

refactor(cli): remove `robo db` command suite

Removed all 9 database CLI commands (check, clear, diff, export, history, migrate, rebuild-indexes, repair, status) as they relied on the removed migration/integrity systems. Database management is now handled automatically by the simplified Flashcore adapter.
