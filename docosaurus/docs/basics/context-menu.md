# Context Menu 🖱️

These are your quick, right-click interactions that swoop in when users right-click a message or a user. They may not boast options, descriptions, or command stacking like slash commands, but they shine in simplicity and context awareness. Choose between "Message" and "User" to suit the situation.

## Forging a Context Menu Command 🛠️

Carving out a context menu command is a walk in the park. Simply whip up a new file in the fitting subdirectory under `/src/context`, and voila - your command is born! Name your file, and hence the command, as you like - spaces and capitalized letters are A-OK here!

Here's a snapshot of what it could look like:

```
/src
└── /context
    ├── /message
    │   ├── Translate.js
    │   └── Analyze Sentiment.js
    └── /user
        ├── Kick.js
        └── Send Welcome Message.js
```

## Message Command Example 📬

When your message command is summoned, you'll receive a `MessageContextMenuCommandInteraction` object and the targeted message. Pretty neat, right?

Let's say you're crafting a command to translate a message:

```javascript
// /src/context/message/Translate.js
import { translateMessage } from '../services/translator.js'

export default async function (interaction, message) {
	const translatedContent = await translateMessage(message.content)
	return `Translation: ${translatedContent}`
}
```

## User Command Example 👤

If you're stirring up a user command instead, you'll be served a `UserContextMenuCommandInteraction` object along with the selected user.

Here's a glimpse of a user command in action, giving a user the ol' kickaroo:

```javascript
// /src/context/user/Kick.js
export default async function (interaction, user) {
	const guildMember = interaction.guild.members.resolve(user)
	await guildMember.kick()
	return `Yeeted ${user.username} from the server. Bye! 👋`
}
```

## Smooth Sailing from Here 🌊

If you've already dipped your toes into slash commands, this should be a familiar beach. Your context commands get the first-class ticket with automatic registration, and Sage stays by your side, making interaction replies as cool as a cucumber. So, go ahead, craft those unique context menu commands and let your server shine! 🌟
