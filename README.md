<p align="center">
	<img src="https://raw.githubusercontent.com/Wave-Play/robo/main/docs/_assets/sage-avatar.png" height="128">
  <h1 align="center">Robo.js</h1>
</p>

<div align="center">

[![GitHub license](https://img.shields.io/github/license/Wave-Play/robo?style=flat)](https://github.com/Wave-Play/robo/blob/main/LICENSE) ![npm](https://img.shields.io/npm/v/@roboplay/robo.js) [![install size](https://packagephobia.com/badge?p=@roboplay/robo.js@latest)](https://packagephobia.com/result?p=@roboplay/robo.js@latest)

**Turbocharge [Discord.js](https://discord.js.org/) with effortless power!** ⚡

Upgrade your bots with next-gen simplicity, snappy plugin system, epic debugging, and Sage's streamlined interactions, all while keeping Discord.js' power. 🚀✨

> **Heads up!** This is a pre-release, so brace for some breaking changes before **v1.0**. 🚧

</div>

## Documentation

Get well-versed with Robo.js and unlock its full potential!

**➞ [📚 Dive into the full documentation for more.](/docs)**

## Quick start

Kickstart your own Robo.js bot with our super-helpful CLI:

```bash
npx create-robo my-awesome-bot
```

We'll walk you through a breezy customization process and whip up a fully working template in no time!

## Adding to an existing project

Depending on your bot's complexity, there are 3 smooth migration paths to choose from. Each tailored to make your bot's transition as seamless as possible.

Check out our migration guide for a detailed breakdown of the 3 migration options, and pick the one that suits your bot best.

**➞ [📚 See the full migration guide](/docs/developing/overview.md)**

## Epic Simplicity

Robo.js dishes out Discord.js goodness with a focus on simplicity, making it easy-peasy to craft bots that truly sparkle – all without compromises! 🌟

- **Easy-peasy:** No fuss, just a smooth start to bot development, so you can focus on crafting cool features.
- **Built-in awesomeness:** Commands, events, plugins - it's all there, ready to create bots that pack a punch.
- **Sage's helping hand:** Sage simplifies command interaction and offers smart error replies, making debugging a breeze.
- **Customizable & scalable:** Adjust, grow, and adapt your bot as needed with Robo.js's flexibility.
- **Community power:** Tap into the know-how and support of the Discord.js community.

## Usage

Crafting a simple Robo is a piece of cake! First, whip up a `/ping` command by creating a `ping.js` file in your `/src/commands` folder:

```javascript
export default () => {
	return 'Pong!'
}
```

Miss your interaction object? No worries, it's still got your back! Here's another example using `interaction.reply`:

```javascript
export default (interaction) => {
	interaction.reply('Pong!')
}
```

For events, say you want to listen to `messageCreate` events. Create a `messageCreate.js` file inside your `/src/events` folder:

```javascript
export default (message) => {
    if (message.content.includes('hello')) {
        message.channel.send('Hello there!');
    }
}
```

Following the above examples, your file structure should look a lil' something like this:

```
src/
├── commands/
│   └── ping.js
└── events/
    └── messageCreate.js
```

Robo.js will automatically handle the necessary permissions when you run `robo invite`.

### No Learning Curve

With Robo.js, there's practically no learning curve! As a framework for Discord.js, you'll still have access to everything Discord.js has to offer. 🎉

To get your Robo grooving in development mode, bust out `robo dev` (or `npm run dev`). When you're all set to host your Robo, hit `robo build`, then kick things off with `robo start`. Don't forget to explore the [full documentation](/docs) for even more awesomeness! 🔥

## License 📜

Robo.js is all about freedom, so we've got you covered with the permissive MIT License! Go wild and build amazing bots without worrying about legalities.

Feel free to check out the [LICENSE](LICENSE) file for more info!
