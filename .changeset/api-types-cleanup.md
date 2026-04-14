---
'robo.js': minor
---

refactor: remove legacy HTTP types from core exports

Removed `types/api.ts` and its exports (RoboRequest, RoboReply, RouteHandler, Api, ApiEntry, HttpMethod). These types now live in @robojs/server. Added new HandlerSummary interface and route summary APIs (routeSummaries, routeSummariesSync, reloadRouteSummaries) to manifest v1.
