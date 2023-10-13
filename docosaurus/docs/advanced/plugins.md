# Plugins 🧩

Plugins empower developers to effortlessly add new features to their existing Robos.

## Installing plugins

To install a plugin, run the following command:

```bash
npx robo add awesome-robo-plugin
```


That's it! Your Robo now has access to the additional features provided by the plugin. 

The plugin's commands and events are automatically linked. Plus, if your Robo needs any extra bot permissions, they'll be inherited when running `robo invite` to generate an invite link. So just sit back and enjoy the extra functionality!

## Creating Plugins 🛠️

Developing a Robo plugin works in the same way as developing features for a Robo. Check out the [overview section](/docs/basics/overview) for more details on how to develop a plugin.

To create a new plugin project, run the following command:

```bash
npx create-robo your-awesome-robo-plugin --plugin
```

🔑 Make sure to include the `--plugin` flag, as it's essential for creating a new Plugin project.

### Testing Your Plugin 🧪

To test your plugin during development, you can install it from your local directory in a test Robo project. First, navigate to your test Robo project's directory and run the following command:

```bash
npx robo add /path/to/your-awesome-robo-plugin
```

> **Heads up:** On Windows, the path may look like this instead: `C:\path\to\your-awesome-robo-plugin`

Replace `/path/to/your-awesome-robo-plugin` with the actual path to your plugin's directory. Remember to build your plugin between changes using the `robo build plugin` command.

You can use the `--watch` flag to automatically rebuild your plugin when changes are detected. This is the recommended way to develop your plugin, as it provides a smoother development experience. If your test Robo is also running in dev mode, it will auto-reload when your plugin is rebuilt.

```bash
npx robo build plugin --watch
```

### Building the Plugin 🔨

Robo comes with a built-in compiler to help you package your plugin for distribution. To build your plugin, run the following command:

```bash
npx robo build plugin
```

This will compile your plugin and prepare it for publishing to NPM.

### Publishing to NPM 📦

Once you've built your plugin using `robo build plugin`, you're ready to publish it to NPM. Make sure you've set up your NPM account and are logged in through the CLI.

Run the following command to publish your plugin:

```bash
npm publish
```

🎉 Congratulations! Your plugin is now available on NPM for other Robo.js users to install and enjoy.

⚠️ Remember to keep sensitive information out of your plugin. Avoid including any `.env` files or similar data that should not be shared with other users.

Happy plugin development! 🚀
