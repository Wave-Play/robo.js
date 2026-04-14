---
'@robojs/server': minor
---

feat: enhance router for HMR-driven route mutations

Radix3 remove() improved with proper empty node pruning via new shouldPruneNode() helper. Router gains addRoute() upsert behavior (replace if exists), removeRoute() with boolean return, and hasRoute() for existence checks.
