---
'@robojs/discordjs': minor
---

fix: improve command and context handler safety

Command handler now validates reply values with stricter Message-like object detection (requires both author and channelId), supports serverOnly metadata for guild-restricted commands, and throws Error objects instead of strings for missing exports. Context handler gracefully handles "Unknown interaction" and "already acknowledged" errors during defer, guards against undefined targets, and applies the same isValidReply improvements.
