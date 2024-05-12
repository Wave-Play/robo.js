# @robojs/dev

Welcome to _@robojs/dev_! For developers fine-tuning their **[Robo.js](https://github.com/Wave-Play/robo)** projects, this plugin is a must-have. Seamlessly test Robo APIs, monitor resources, and emulate specific Robo behaviors, all in one package. Just install, and you're ready to go!

## Installation 💻

To integrate this plugin into your project, simply navigate to your Robo directory and input:

```bash
npx robo add @robojs/dev
```

Voilà! Your Robo is now supercharged with development tools.

## ⚠️ Important Note

This plugin is crafted explicitly for development environments. Before deploying your Robo, ensure you uninstall this plugin to prevent users from directly manipulating your server or database.

Execute the following to safely remove:

```bash
npx robo remove @robojs/dev
```

## Commands

Equip your Robo with the following commands for an enhanced development experience:

| Command                           | Description                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/devtools example defer`         | Demonstrates Sage's auto deferral feature, showcasing varying behaviors.                                  |
| `/devtools example error`         | Intentionally triggers an error, either asynchronous or not—great for validating Sage's debug mode setup. |
| `/devtools example permission-dm` | Illustrates slash command usage outside of direct messages.                                               |
| `/devtools flashcore clear`       | **Caution!** Wipes out _all_ Flashcore values.                                                            |
| `/devtools flashcore delete`      | Removes a specific key from Flashcore.                                                                    |
| `/devtools flashcore get`         | Retrieves the current value of a Flashcore key.                                                           |
| `/devtools flashcore set`         | Assigns a value to a Flashcore key.                                                                       |
| `/devtools flashcore watch`       | Observes key changes, highlighting differences and sending notifications.                                 |
| `/devtools module check`          | Confirms if a particular module is active.                                                                |
| `/devtools module set`            | Toggles a module's active state.                                                                          |
| `/devtools state get`             | Fetches a state value.                                                                                    |
| `/devtools state set`             | Alters a state value.                                                                                     |

For those eager to delve deeper into Robo APIs, inspecting the [plugin's source code](https://github.com/Wave-Play/robo.js/tree/main/packages/plugin-devtools) provides good usage examples. Trust us, it's simpler than you may think!

## Resource monitoring

Efficiency is key! The DevTools plugin also empowers you with a mechanism to supervise CPU and RAM utilization over time. This resource monitoring is instrumental in gauging the performance of your Robo and pin-pointing areas for enhancement.

To enable this feature, set `monitorResources` to `true` in the plugin's configuration. By default, the plugin will check resources every 5 seconds, but you're free to adjust the `monitorInterval`:

```js
export default {
	monitorInterval: 10_000, // Inspects every 10 seconds
	monitorResources: true // Activates resource monitoring
}
```

> **Yet to set foot in the Robo.js universe?** [Embark on your Robo journey now!](https://docs.roboplay.dev/docs/getting-started)

Level up your development process with Robo.js and the DevTools plugin! 🚀
