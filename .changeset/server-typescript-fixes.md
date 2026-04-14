---
'@robojs/server': minor
---

fix: TypeScript compatibility and schema target update

Add type assertions for Response.json() and getSetCookie() to handle TypeScript strict mode compatibility. Update Zod JSON schema generation target from openapi-3.0 to draft-2020-12 for better schema compatibility.
