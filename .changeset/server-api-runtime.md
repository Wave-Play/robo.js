---
'@robojs/server': minor
---

feat: add ApiRuntime for dev-mode route management

New ApiRuntime class that manages API handler slots, route topology, and mutations for development mode. Supports handler staling for cache invalidation, topology syncing when routes are added or removed, and rollback on failure. Enables instant HMR without server restart.
