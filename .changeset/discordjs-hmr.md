---
'@robojs/discordjs': minor
---

feat: extend HMR for events and prefix commands

HMR system now supports events and prefixCommands routes. Event listener changes trigger topology sync. Prefix command changes invalidate the alias index and register the prefix handler if needed. Registration queue serialized to prevent overlapping Discord API calls from rapid saves.
