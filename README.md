<!--<div align="center">

| ✨🎃 **Hacktoberfest Event** 🎃✨ |
|:-----------------------------------:|
| Build something with Robo.js to win prizes! |
| **[Details & Prizes](https://blog.waveplay.com/hacktoberfest-with-robo-js-build-bots-or-plugins-win-cool-prizes)** |

</div>

&nbsp;-->

<p align="center">
  <img src="https://raw.githubusercontent.com/Wave-Play/robo/main/docosaurus/static/img/logo.png" height="128">
  <h1 align="center">Robo.js</h1>
</p>

<div align="center">

<!-- TODO: Reinstate "@latest" for packagephobia badge - temporarily set to last working version due to misleading size report -->
[![GitHub license](https://img.shields.io/github/license/Wave-Play/robo)](https://github.com/Wave-Play/robo/blob/main/LICENSE) [![npm](https://img.shields.io/npm/v/@roboplay/robo.js)](https://www.npmjs.com/package/@roboplay/robo.js) [![install size](https://packagephobia.com/badge?p=@roboplay/robo.js@0.9.7)](https://packagephobia.com/result?p=@roboplay/robo.js@latest) [![Discord](https://img.shields.io/discord/1087134933908193330?color=7289da)](https://roboplay.dev/discord) [![All Contributors](https://img.shields.io/github/all-contributors/Wave-Play/robo.js?color=cf7cfc)](#contributors)


**Turbocharge [Discord.js](https://discord.js.org/) with effortless power!** ⚡

Upgrade your bots with next-gen simplicity, snappy plugin system, epic debugging, and Sage's streamlined interactions, all while keeping Discord.js' power. 🚀✨

> **Heads up!** This is a pre-release, so brace for some breaking changes before **v1.0**. 🚧

</div>

## Documentation

Get well-versed with Robo.js and unlock its full potential!

➞ [📚 **Documentation:** Getting started](https://docs.roboplay.dev/docs/getting-started)

➞ [📖 **Tutorial:** Making a "To-do" Robo](https://blog.waveplay.com/how-to-make-a-discord-robo)

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)

## Quick start

Kickstart your own Robo.js bot with our super-helpful CLI:

```bash
npx create-robo my-awesome-bot
```

We'll walk you through a breezy customization process and whip up a fully working template in no time!

## Upgrading an existing bot

Got a bot that's simple or loaded with complexity? No worries! We've whipped up three migration paths that cater to all bot types. For the full lowdown, our migration guide is ready and waiting. Pick the path that makes your bot's transition smoother than butter on a hot day.

➞ [📚 **Documentation:** Migration guide](https://docs.roboplay.dev/docs/migrating)

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

Before you get your Robo rockin', update your `.env` with `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Then, hit `robo dev` and let the show begin! Seriously, that's it!

Crave more power? Check the [**Documentation**](https://docs.roboplay.dev/docs/getting-started)! 🔥

### No Learning Curve

Get ready for a twist - **there's virtually no learning curve with Robo.js!**

Wait, is it actually an... inverse learning curve? You heard right, there's more to unlearn than learn! It's that simple, yet you still have access to all that Discord.js has to offer, just easier and with less code. 🎉

## License 📜

We're all about freedom, so we've got you covered with the permissive **[MIT License](LICENSE)**! Go wild and build amazing bots without worrying about legalities.

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="http://pkmmte.com"><img src="https://avatars.githubusercontent.com/u/3953360?v=4?s=100" width="100px;" alt="Pkmmte Xeleon"/><br /><sub><b>Pkmmte Xeleon</b></sub></a><br /><a href="[✨]("WavePlay Staff")," title="WavePlay Staff">✨</a> <a href="https://github.com/Wave-Play/robo.js/commits?author=Pkmmte" title="Code">💻</a> <a href="#maintenance-Pkmmte" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Nazeofel"><img src="https://avatars.githubusercontent.com/u/96749659?v=4?s=100" width="100px;" alt="Alexander"/><br /><sub><b>Alexander</b></sub></a><br /><a href="https://github.com/Wave-Play/robo.js/commits?author=Nazeofel" title="Code">💻</a> <a href="#maintenance-Nazeofel" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/0xMouiz"><img src="https://avatars.githubusercontent.com/u/96005374?v=4?s=100" width="100px;" alt="Mouiz"/><br /><sub><b>Mouiz</b></sub></a><br /><a href="https://github.com/Wave-Play/robo.js/commits?author=0xMouiz" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mbos2"><img src="https://avatars.githubusercontent.com/u/56090587?v=4?s=100" width="100px;" alt="Matej Bošnjak"/><br /><sub><b>Matej Bošnjak</b></sub></a><br /><a href="https://github.com/Wave-Play/robo.js/commits?author=mbos2" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ArnavK-09"><img src="https://avatars.githubusercontent.com/u/69188140?v=4?s=100" width="100px;" alt="Arnav K"/><br /><sub><b>Arnav K</b></sub></a><br /><a href="#example-ArnavK-09" title="Examples">💡</a> <a href="#plugin-ArnavK-09" title="Plugin/utility libraries">🔌</a> <a href="https://github.com/Wave-Play/robo.js/commits?author=ArnavK-09" title="Documentation">📖</a></td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td align="center" size="13px" colspan="7">
        <img src="https://raw.githubusercontent.com/all-contributors/all-contributors-cli/1b8533af435da9854653492b1327a23a4dbd0a10/assets/logo-small.svg">
          <a href="https://all-contributors.js.org/docs/en/bot/usage">Add your contributions</a>
        </img>
      </td>
    </tr>
  </tfoot>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
<!-- prettier-ignore -->
<!-- ALL-CONTRIBUTORS-LIST:END -->
