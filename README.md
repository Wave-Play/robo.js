<p align="center">
	<img src="https://raw.githubusercontent.com/Wave-Play/robo/main/docs/_assets/sage-avatar.png" height="128">
  <h1 align="center">Robo.js</h1>
</p>

<div align="center">

[![GitHub license](https://img.shields.io/github/license/Wave-Play/robo?style=flat)](https://github.com/Wave-Play/robo/blob/main/LICENSE) ![npm](https://img.shields.io/npm/v/@roboplay/robo.js) [![install size](https://packagephobia.com/badge?p=@roboplay/robo.js@0.4.2)](https://packagephobia.com/result?p=@roboplay/robo.js@0.4.2)

**Turbocharge [Discord.js](https://discord.js.org/) with effortless power!** ⚡

Robo.js turbocharges Discord bot-building with a snappy plugin system and Sage's streamlined handling, all while keeping Discord.js' power. 🚀✨

> **Heads up!** This is a pre-release, so brace for some breaking changes before **v1.0**. 🚧

</div>

## Documentation

Get well-versed with Robo.js and unlock its full potential!

**➞ [📚 Dive into the full documentation for all the deets.](/docs)**

## Quick start

Kickstart your own Robo.js bot with our super-helpful CLI:

```bash
npx create-robo my-awesome-bot
```

We'll walk you through a breezy customization process and whip up a fully working template in no time!

## Adding to an existing project

```bash
npm install @roboplay/robo.js
```

## Epic Simplicity

Robo.js powers up your bot-making game with Discord.js, while keeping it all super simple. Its top strengths include:

1. **Easy-peasy:** No fuss, just a smooth start to bot development, so you can focus on crafting cool features.
2. **Built-in awesomeness:** Commands, events, plugins - it's all there, ready to create bots that pack a punch.
3. **Sage's helping hand:** Sage simplifies command interaction and offers smart error replies, making debugging a breeze.
4. **Customizable & scalable:** Adjust, grow, and adapt your bot as needed with Robo.js's flexibility.
5. **Community power:** Tap into the know-how and support of the Discord.js community.

Robo.js brings the best of Discord.js, with added ease and pizzazz, helping you create bots that truly shine. 🌟

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

Robo.js will automatically handle the necessary permissions when you run `robo invite`.

### No Learning Curve

With Robo.js, there's practically no learning curve! As a framework for Discord.js, you'll still have access to everything Discord.js has to offer. 🎉

To get your Robo grooving in development mode, bust out `robo dev` (or `npm run dev`). When you're all set to host your Robo, hit `robo build`, then kick things off with `robo start`. Don't forget to explore the [full documentation](/docs) for even more awesomeness! 🔥

## License 📜

Robo.js is all about freedom, so we've got you covered with the permissive MIT License! Go wild and build amazing bots without worrying about legalities.

Feel free to check out the [LICENSE](LICENSE) file for more info!
