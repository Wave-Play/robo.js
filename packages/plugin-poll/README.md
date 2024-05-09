# 🚀 @roboplay/plugin-poll

Welcome to _@roboplay/plugin-poll_! This plugin is designed to seamlessly integrate with your existing **[Robo.js](https://github.com/Wave-Play/robo)** project and provide new features and enhancements to your robo. The best part? Everything automatically works once you install this plugin!

👩‍💻 Are you the plugin developer? Check out the **[Development Guide](DEVELOPMENT.md)** for instructions on how to develop, build, and publish this plugin.

## Installation 💻

To install this plugin, navigate to your Robo project's directory and run the following command:

```bash
npm install @roboplay/plugin-poll
```

Next, add the plugin to your Robo's configuration file, typically located at `.config/robo.mjs`. Add the following lines:

```javascript
/**
 * @type {import('@roboplay/robo.js').Plugin}
 **/
const roboplayPluginPoll = [
	'@roboplay/plugin-poll',
	{
		// ... optional customization options
	}
]

/**
 * @type {import('@roboplay/robo.js').Config}
 **/
export default {
	// ... rest of your configuration
	plugins: [roboplayPluginPoll]
}
```

That's it! Your Robo now has access to the additional features provided by this plugin. The plugin's commands and events are automatically linked, and if your Robo requires any additional bot permissions, they will be inherited when running `robo invite` to generate an invite link.

Enjoy your enhanced Robo! 🚀
