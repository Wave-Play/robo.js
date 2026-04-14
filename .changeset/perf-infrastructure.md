---
'robo.js': minor
---

perf: parallel I/O, startup optimization, env caching, and IPC protocol

Parallelized I/O operations during config loading, hooks, portal initialization, and startup. Optimized startup path for `robo start`. Environment variable loading now caches to prevent redundant file reads. New lightweight IPC protocol for inter-process communication.
