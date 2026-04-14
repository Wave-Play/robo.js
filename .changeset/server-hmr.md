---
'@robojs/server': minor
---

feat: add HMR hook for API route topology and handler changes

New HMR hook that listens for server:api route changes, syncs topology when routes are added or removed, and marks handlers stale for cache invalidation. Stop hook updated to dispose ApiRuntime, stop dev-reload, clear Robo status, and reset ready flag.
