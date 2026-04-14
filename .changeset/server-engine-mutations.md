---
'@robojs/server': minor
---

feat: add route mutation API to engines

New abstract methods on BaseEngine: unregisterRoute(), replaceRoute(), hasRoute(), supportsRouteMutation(). NodeEngine implements full route mutation support via router delegation. FastifyEngine signals unsupported with debug logging. Both engines use Robo.status.set() for startup logging and prevent concurrent stop calls.
