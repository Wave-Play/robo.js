---
'@robojs/server': minor
---

feat: extract core API routing utilities

New api-routing module with reusable utilities: normalizeServerPrefix() for prefix handling, getApiRoutePath() for path conversion, createRegisteredApiRoutes() for route registration, and createMethodDispatcher() for HTTP method-based routing. Enables shared route handling between dev and prod startup paths.
