---
'robo.js': minor
---

feat: "prepare" and "error" lifecycle hooks with priority system

New `prepare` hook runs before main startup for early initialization. New `error` hook provides runtime error handling. All lifecycle hooks now support a priority system for controlling execution order.
