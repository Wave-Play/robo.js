# 🚀 @roboplay/plugin-confessions

Welcome to `@roboplay/plugin-confessions`. This plugin is designed to seamlessly integrate with your existing **[Robo.js](https://github.com/Wave-Play/robo)** project and provide new features and enhancements to your robo. The best part? Everything automatically works once you install this plugin!

👩‍💻 Are you the plugin developer? Check out the **[Development Guide](DEVELOPMENT.md)** for instructions on how to develop, build, and publish this plugin.

## Installation 💻

To install this plugin, navigate to your existing Robo project's directory and run the following command:

```bash
npx robo add @roboplay/plugin-confessions
```

# 🤫 Confessions Plugin

This plugin allows users to make anonymous confessions in your Discord server.

## 🎲 Plugin Commands

- `/confess [confession]` - Make an anonymous confession. The confession will be filtered for SFW content & URLs before posting.

- `/confession-channel [channel]` - Set the channel where confessions will be posted. Only admins can use this command.

> **The plugin handles everything else automatically! Confessions will be posted to the configured channel anonymously.**

## 🌟 Features

- [x] **Auto Filters NSFW Content**: Implement intelligent filters that automatically detect and remove or flag not-safe-for-work (NSFW) content, ensuring a safe and clean environment for all users.
- [x] **Censor Swears & Abuses in Confessions**: Employ profanity filters to discreetly mask or block offensive language and abusive content in user confessions, maintaining a respectful and positive user experience.
- [x] **Simple and Fast!**: Create an intuitive and responsive platform that is easy to use, ensuring a hassle-free experience for users without unnecessary complexity or delays.
- [x] **Sage Responses**: Sage is all about smoothing out the rough edges, doing the heavy lifting, and leaving you with the fun stuff. It's your backstage crew, your invisible helping hand, your automatic pilot. You lead the way, and Sage is there to back you up.
- [x] **Fully Anonymous Confessions**: Guarantee complete anonymity for users sharing their confessions, ensuring that no personal information is revealed and privacy is upheld.

---

That's it! Your Robo now has access to the additional features provided by this plugin. The plugin's commands and events are automatically linked, and if your Robo requires any additional bot permissions, they will be inherited when running `npx robo invite` to generate an invite link.

Enjoy your enhanced Robo! 🚀

> **Don't have a Robo project?** [Create your own!](https://docs.roboplay.dev/docs/getting-started)
