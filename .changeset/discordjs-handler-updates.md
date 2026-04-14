---
'@robojs/discordjs': minor
---

refactor: update event handler, autocomplete, and middleware

Event handler updated for manifest v1 portal API. Autocomplete handler now calls portal.ensureRoute() before execution. Middleware supports order metadata for sorting and uses manifest-based route loading.
