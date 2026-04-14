---
'@robojs/server': minor
---

refactor: separate dev and prod startup paths

Start hook refactored to split dev/prod logic: dev mode uses ApiRuntime for HMR-driven route mutations and lazy loading, prod mode uses eager portal loading. Extracted createMethodDispatcher and lazy handler logic into api-routing module. Added globalThis.roboServer metadata (port, hostname, startedAt, registeredPaths).
