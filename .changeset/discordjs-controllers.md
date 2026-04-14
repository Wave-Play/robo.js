---
'@robojs/discordjs': minor
---

feat: add prefix command and namespace controllers

New createPrefixCommandController factory for per-handler enable/disable and server restriction methods. Namespace controllers updated to use Manifest.routeSummariesSync() for listing instead of direct portal access. Added createPrefixCommandsNamespaceController for programmatic prefix command management.
