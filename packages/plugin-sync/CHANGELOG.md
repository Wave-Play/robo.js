# @robojs/sync

## 0.2.0-next.0

### Minor Changes

- feat: broadcast and context apis
- feat: SyncZone, SyncBox, useZoneKey, and server APIs
- feat: realtime Flashcore state subscriptions

  New subscription system that synchronizes Flashcore persistent storage with connected WebSocket clients in real-time. Clients can subscribe to Flashcore key changes and receive automatic updates when server-side state mutates. Includes subscription lifecycle management with limits and cleanup.

- feat: high level primitive apis

## 0.1.3

### Patch Changes

- 589419c: chore: support for react 19
- Updated dependencies [6f4476c]
- Updated dependencies [97ae5bd]
  - robo.js@0.10.28

## 0.1.2

### Patch Changes

- b8395b7: patch: better support for non-tunneled localhost

## 0.1.1

### Patch Changes

- 89853bd: patch: shared connection liveness check

## 0.1.0

### Minor Changes

- 1cb4011: feat: sync plugin
