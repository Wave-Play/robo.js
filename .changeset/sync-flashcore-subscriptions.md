---
'@robojs/sync': minor
---

feat: realtime Flashcore state subscriptions

New subscription system that synchronizes Flashcore persistent storage with connected WebSocket clients in real-time. Clients can subscribe to Flashcore key changes and receive automatic updates when server-side state mutates. Includes subscription lifecycle management with limits and cleanup.
