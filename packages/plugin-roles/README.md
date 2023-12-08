# 🚀 plugin-roles

Welcome to _plugin-roles_! This plugin is designed to seamlessly integrate with your existing **[Robo.js](https://github.com/Wave-Play/robo)** project and provide new features and enhancements to your robo. The best part? Everything automatically works once you install this plugin!

➞ [📚 **Documentation:** Getting started](https://docs.roboplay.dev/docs/getting-started)

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)

> 👩‍💻 **Are you the plugin developer?** Check out the **[Development Guide](DEVELOPMENT.md)** for instructions on how to develop, build, and publish this plugin.

## Installation 💻

To install this plugin, navigate to your existing Robo project's directory and run the following command:

```bash
npx robo add @roboplay/plugin-roles
```

# 👥 Roles Plugin  

This plugin offers drop down menu roles for discord guild as well as option to restrict commands to specific roles.

## 🎚️ Plugin Commands

- `/roles setup\` - Initiate setup for role picker menu! user friendly! 

- `/role restrict\` - Configure role-based restrictions for slash commands!  

> **The plugin handles role assignment and restrictions automatically based on configurations!**

## ✳️ Features  

- [x] **Drop-down Menu**: Easy role selection menu for users to assign themselves roles.

- [x] **Interaction Based**: Role management done through user-friendly slash commands, buttons as well as modals interactions.

- [x] **Fully Customizable**: Server admins can customize roles, embeds, colors, menu, and restrictions as needed.  

- [x] **Database Integration**: Persistent role setup & restrictions data stored in a database.

- [x] **Autocomplete Enabled**: Slash commands feature autocomplete for ease of use.

---

That's it! Your Robo now has access to the additional features provided by this plugin. The plugin's commands and events are automatically linked, and if your Robo requires any additional bot permissions, they will be inherited when running `npx robo invite` to generate an invite link.

Enjoy your enhanced Robo! 🚀

> **Don't have a Robo project?** [Create your own!](https://docs.roboplay.dev/docs/getting-started)
