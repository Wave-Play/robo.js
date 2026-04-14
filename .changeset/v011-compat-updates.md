---
'@robojs/giveaways': minor
'@roboplay/plugin-confessions': minor
---

refactor: migrate imports to @robojs/discordjs for v0.11

Updated command type imports (`CommandConfig`, `CommandOptions`, `CommandResult`, `createCommandConfig`) from `robo.js` to `@robojs/discordjs`. Updated `CommandInteraction` to `ChatInputCommandInteraction` for type accuracy. Added explicit type annotations where TypeScript inference changed.
