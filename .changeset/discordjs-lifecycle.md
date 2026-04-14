---
'@robojs/discordjs': minor
---

feat: refactor lifecycle, prepare, and intent checking

Discord client startup refactored to register clientReady listener before login. Intent checking now inspects registered event handlers and prefix commands. Prepare hook updated for prefix command handler registration. Stop hook cleans up event topology state. New checkPrefixIntents utility validates MessageContent and GuildMessages intents for prefix commands.
