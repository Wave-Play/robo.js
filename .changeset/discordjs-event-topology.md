---
'@robojs/discordjs': minor
---

feat: implement event topology system

New centralized event topology manager that tracks Discord event listener registration state. Enables dynamic listener synchronization during HMR — listeners are added or removed as event handlers change without requiring a restart.
