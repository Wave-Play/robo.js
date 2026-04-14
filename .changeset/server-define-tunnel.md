---
'@robojs/server': minor
---

feat: typed endpoints with `define()`, tunnel support, and testing utilities

New `define()` function for type-safe API route handlers with schema validation. Cloudflare tunnel integration (`CloudflareProvider`) with terminal commands (`/tunnel start`, `/tunnel stop`, `/tunnel list`). Port utilities (`isPortAvailable`, `findAvailablePort`). HTTP method named exports for route handlers. Plugin route registry for prefix management. Testing utilities for route handlers.
