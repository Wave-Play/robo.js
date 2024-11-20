<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# Discord Activity - Unity

Welcome to your fresh **[Robo.js](https://github.com/Wave-Play/robo)** project!

Build, deploy, and maintain your Discord activities with ease. With Robo.js as your guide, you'll experience a seamless, [file-based setup](https://docs.roboplay.dev/docs/basics/overview#the-robojs-file-structure), an [integrated database](https://docs.roboplay.dev/docs/basics/flashcore), [TypeScript support](https://docs.roboplay.dev/docs/advanced/typescript), and a multitude of [plugin-powered skills](https://docs.roboplay.dev/docs/advanced/plugins) to unlock along the way.

_Ready to embark on this adventure?_

## Table of Contents

- [Discord Activity - Unity](#discord-activity---unity)
- [Table of Contents](#table-of-contents)
- [🔗 Quick Links](#-quick-links)
- [✨ Getting Started](#-getting-started)
- [Connecting your Unity game](#connecting-your-unity-game)
- [App Development 🛠️](#app-development-️)
- [Authenticating](#authenticating)
- [Backend Development 🛠️](#backend-development-️)
- [Folder Structure 📁](#folder-structure-)
- [Plugins 🔌](#plugins-)
- [Deployment 🚀](#deployment-)

## 🔗 Quick Links

- [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)
- [📚 **Documentation:** Getting started with Robo](https://robojs.dev/discord-activities/getting-started)
- [📖 **Tutorial:** Creating a Discord Activity in seconds](https://dev.to/waveplay/how-to-build-a-discord-activity-easily-with-robojs-5bng)

## ✨ Getting Started

Create a project with this template, replacing `<project-name>` with your desired name:

```bash
npx create-robo <project-name> --template discord-activities/unity
```

Then navigate into your project directory:

```bash
cd <project-name>
```

Run development mode:

```bash
npm run dev
```

## Connecting your Unity game

To import your Unity game inside of your Robo project follow these steps:

In your Unity project install dissonity:

1. Go to `Window` > `Package Manager` > `Add package from git URL`
2. Install the package from https://github.com/Furnyr/Dissonity.git?path=/unity
3. Right click in the hierarchy, Dissonity > Discord Bridge

Once you have done these steps follow these next ones

1. Click on `file` (top left corner)
2. Go to `build settings`
3. In platform, choose `WebGL`
4. Click on build and go into your Robo project and select the public folder.
5. Once the game has been built head over into the index.html file into your public folder
6. Go down the file and introduce a new variable called ```unityInstance``` 
7. Go down again until you see ```createUnityInstance``` in the ```then``` change the paremeter name to ui then in the scope write ```unityInstance = ui```
8. Tada ! you have successfully built a Unity Project with Robo all that's left to do is enjoy making your game.

> **Notes:** If you decide to make a special folder for your project. ex: public/myfolder/mygamefiles please go to src/app/Activity.tsx and change

```ts
<iframe id="dissonity-child" src=".proxy/index.html" height="100vh" width="100vw" scrolling="no"></iframe>
```

to

```ts
<iframe id="dissonity-child" src=".proxy/myfolder/index.html" height="100vh" width="100vw" scrolling="no"></iframe>
```

To get the best of Dissonity please refer to their **[docs](https://github.com/Furnyr/Dissonity/blob/main/unity/Documentation~/Dissonity.md)**!

> **Notes:** A free Cloudflare tunnel is included for easy testing. You can copy and paste it into activity's **[URL mapping](https://robojs.dev/discord-activities/proxy#url-mapping)** to test things out.

➞ [📚 **Documentation:** Exploring Different Run Modes](https://robojs.dev/robojs/mode#default-modes)

➞ [🚀 **Documentation:** Deploying for Free with 24/7 Uptime](https://robojs.dev/hosting/overview)

Your Robo refreshes with every change. 🔄

A free Cloudflare tunnel is included for easy testing. You can copy and paste it into activity's URL mapping to test things out.

> **Psst...** Check out the [deployment instructions](#deployment) to keep your Robo online 24/7.

## App Development 🛠️

You can find your client-side code in the `/src/app` folder. This is where you can build your web app using React, Vue, or any other front-end framework.

Things are powered by Vite under the hood, so you get the latest ES modules, hot module reloading, and more! ⚡

Try editing the `main` file to get started! (`Activity.tsx` if you're using React)

**➞** [📚 **Documentation:** App development](https://docs.roboplay.dev/docs/app/overview)

#### Authenticating

The React template makes it easy to authenticate your activity with Discord. The `<DiscordProvider>` components in `App.tsx` accepts `authenticate` and `scope` props.

```tsx
<DiscordContextProvider authenticate scope={['identify', 'guilds']}>
	<Activity />
</DiscordContextProvider>
```

You can then get the SDK and other goodies from the `useDiscordSdk` hook!

## Backend Development 🛠️

Your server-side code is located in the `/src/api` folder. This is where you can build your API, webhooks, and other fancy server-side features.

This backend is powered by the [**Server Plugin**](https://github.com/Wave-Play/robo.js/tree/main/packages/plugin-api) - a powerful Robo plugin that creates an manages a Node `http` server for you. If you install Fastify, the server will automatically switch to it for better performance!

Everything Robo is file-based, so you can create new routes by making new files in the `/src/api` directory. The file's name becomes the route's path. For example, let's try making a new route at `/health` by creating a new file named `health.js`:

```js
export default () => {
	return { status: 'ok' }
}
```

Easy, right? Check out the [**Server Plugin documentation**](https://github.com/Wave-Play/robo.js/tree/main/packages/plugin-api) for more info!

## Folder Structure 📁

While the `api` and `app` folders are reserved for your server and client-side code, you are free to create anything else in the `/src` directory!

Folders only become reserved when you install a plugin that uses them. For example, bot functionality uses the `commands` and `events` folders.

## Plugins 🔌

This Robo boasts an intuitive plugin system that grants new capabilities instantly!

```bash
npx robo add @robojs/ai
```

> Swap out [`@robojs/ai`](https://github.com/Wave-Play/robo.js/tree/main/packages/plugin-ai) with your chosen plugin's package name

With that, your Robo automatically equips itself with all the features the plugin offers. Want to revert? Simply use [`robo remove`](https://docs.roboplay.dev/docs/advanced/command-line#plugins) to uninstall any plugin.

**➞** [📚 **Documentation:** Installing plugins](https://docs.roboplay.dev/docs/advanced/plugins#installing-plugins)

Crafting something unique in your Robo project? You can turn your innovations into plugins, be it specific functionalities or your entire Robo. Share your genius with the world!

**➞** [📚 **Documentation:** Creating plugins](https://docs.roboplay.dev/docs/advanced/plugins#creating-plugins)

## Deployment 🚀

Run the `deploy` command to automatically deploy to **[RoboPlay](https://roboplay.dev)** once you're ready to keep your robo online 24/7.

```bash
npm run deploy
```

**➞** [🚀 **RoboPlay:** Hosting your Robo](https://docs.roboplay.dev/docs/hosting)

You can also self-host your robo anywhere that supports Node. Just make sure to run `build` followed by `start`:

```bash
npm run build
npm start
```
