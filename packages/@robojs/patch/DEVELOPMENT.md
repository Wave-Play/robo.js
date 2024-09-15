# 🛠️ Developing @robojs/patch

Welcome, fellow plugin developer! This guide will help you develop, build, and publish your **[Robo.js plugin](https://github.com/Wave-Play/robo/blob/main/docs/advanced/plugins.md)** as an NPM package. The plugin development process is almost identical to creating a regular Robo project, with the added benefit that commands and events will be automatically linked to the robos that install your plugin.

## Developing 🏗️

Create new slash commands by making a new file under the `/src/commands` directory with an exported default function. The file's name becomes the command's name. You can either use the `interaction` parameter or return the result to let Sage handle it for you. For more info on commands, see the [Discord.js documentation](https://discord.js.org/#/docs/main/stable/general/welcome).

To listen to new events, create a file named after the event in `/src/events`. For example, `typingStart.js` will notify you when someone starts typing. You can stack multiple files for the same event by making a directory named after the event. Files inside it can be named whatever you want. For example:

```
- src
  - events
    - typingStart
      - your-file.js
      - another.js
```

## Testing Your Plugin 🧪

To test your plugin during development, you can `robo add` it from your local directory in a test robo project. First, navigate to your test robo project's directory and run the following command:

```bash
npx robo add /path/to/@robojs/patch
```

Replace `/path/to/@robojs/patch` with the actual path to your plugin's directory. Remember to build your plugin between changes using the `robo build` command.

You can use `robo dev` to automatically rebuild your plugin when changes are detected. This is the recommended way to develop your plugin, as it provides a smoother development experience. If your test robo is also running in dev mode, it will auto-reload when your plugin is rebuilt.

```bash
npx robo dev
```

## Building the Plugin 🔨

Robo comes with a built-in compiler to help you package your plugin for distribution. To build your plugin, run the following command:

```bash
npx robo build plugin
```

This will compile your plugin and prepare it for publishing to NPM.

## Publishing to NPM 📦

Once you've built your plugin using the `npx robo build` command, you're ready to publish it to NPM. Make sure you've set up your NPM account and are logged in through the CLI.

Run the following command to publish your plugin:

```bash
npm publish
```

Congratulations! Your plugin is now available on NPM for other Robo.js users to install and enjoy.

Remember to keep sensitive information out of your plugin. Avoid including any `.env` files or similar data that should not be shared with other users.

Happy plugin development! 🎉
