# 📦 Modules

Robo.js ain't just about power—it's all about keeping things neat and tidy too. That's where modules come in. Picture a module like a mini-bot, all packed up inside your main bot. You've got commands and events, all hanging out together under one roof.

Using modules is totally up to you. If you prefer to keep things simple, that's okay too!

## What's in a Module? 👀

In the land of Robo.js, modules are your go-to when you want to bundle commands and events into neat little subfolders. It's like having a bunch of mini-Robo bots living inside your main bot. You can create as many module folders as you want, and name 'em whatever you fancy. Though, it's a smart move to name them after the feature or function that the files inside represent.

Check out this nifty Robo.js file structure with modules:

```plaintext
src/
└── modules/
    ├── moderation/
    |   ├── commands/
    |   └── events/
    └── fun/
        ├── commands/
        └── events/
```

## The Big Picture 🎭

Robo.js lets your `modules` directory chill alongside top-level `commands` and `events` directories. This gives you the freedom to decide how granular you want your bot structure to be. You could have some general commands or events at the top-level, while specific ones are tucked away in their respective modules.

```plaintext
src/
├── commands/
├── events/
└── modules/
    ├── moderation/
    |   ├── commands/
    |   └── events/
    └── fun/
        ├── commands/
        └── events/
```

:::info

**Heads up!** While **events** can **overlap**, **commands** gotta be **unique**. You can't have multiple files with the same name chillin' in different command folders across different modules. Keep your command names unique to dodge any confusion.

:::

## Modules All The Way Down 🪐

Now here's where it gets really interesting! These magical modules can be nested infinitely. Picture this: A module, living inside another module, with another module tucked away inside it, and another... and another... You get the idea—it's modules within modules all the way to the edge of the universe!

Let's glance into the abyss:

```plaintext
src/
└── modules/
    ├── moderation/
    |   ├── commands/
    |   ├── events/
    |   └── modules/
    |       ├── chat-monitor/
    |       └── ban-hammer/
    └── fun/
        ├── commands/
        └── events/
```

## Gearing Up for Plugins ⚡

The cherry on top of using modules? They're your first step towards making plugins!

If you're thinking about sharing some of your nifty features as plugins later, modules are your best bet. By grouping related commands and events together, you're already halfway to creating a shareable plugin.

Check out the [plugins documentation](./plugins.md) for more.

## Wrapping Up 🎁

Modules in Robo.js give you a neat, organized way to structure your bot. By bundling up related commands and events, you can keep your codebase slick and manageable. Plus, if you ever decide to bundle some of your bot's features into plugins, you're all set.

Remember, like everything in Robo.js, modules are here to make your life easier, but they're totally optional. Use 'em in the way that suits you best!
