<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# Web App - React (TS)

Welcome to your fresh **[Robo.js](https://github.com/Wave-Play/robo)** project!

Build, deploy, and maintain your Discord activities with ease. With Robo.js as your guide, you'll experience a seamless, [file-based setup](https://docs.roboplay.dev/docs/basics/overview#the-robojs-file-structure), an [integrated database](https://docs.roboplay.dev/docs/basics/flashcore), [TypeScript support](https://docs.roboplay.dev/docs/advanced/typescript), and a multitude of [plugin-powered skills](https://docs.roboplay.dev/docs/advanced/plugins) to unlock along the way.

_Ready to embark on this adventure?_

## Table of Contents

- [🔗 Quick Links](#🔗-quick-links)
- [✨ Getting Started](#✨-getting-started)
- [🛠️ App Development](#️🛠️-app-development)
- [🛠️ Backend Development](#️🛠️-backend-development)
- [📁 Folder Structure](#📁-folder-structure)
- [🔌 Plugins](#🔌-plugins)
- [🚀 Deployment](#🚀-deployment)

## 🔗 Quick Links

- [🌟 **Core Package:** See what makes Robo.js awesome](https://robojs.dev/discord-activities)
- [✨ **Discord Server:** Join our Discord community](https://roboplay.dev/discord)

## ✨ Getting Started

Create a project with this template, replacing `<project-name>` with your desired name:

```bash
npx create-robo --template web-apps/react-ts --name <project-name>
```

Then navigate into your project directory:

```bash
cd <project-name>
```

Run development mode:

```bash
npm run dev
```

> **Notes:** A free Cloudflare tunnel is included for easy testing.

- [📚 **Documentation:** Exploring Different Run Modes](https://robojs.dev/robojs/mode#default-modes)
- [🚀 **Hosting:** Deploy your web app for others to use.](https://robojs.dev/hosting/overview)

## App Development 🛠️

You can find your client-side code in the `/src/app` folder. This is where you can build your web app using **[React](https://react.dev)**, but you can switch to any other framework if you prefer.

Things are powered by **[Vite](https://vitejs.dev)** under the hood, so you get the latest ES modules, hot module reloading, and more! ⚡

Try editing the `App.tsx` file to get started!

- [📚 **Documentation:** App development](https://robojs.dev/web-apps)

## Backend Development 🛠️

Your server-side code is located in the `/src/api` folder. This is where you can build your API, webhooks, and other fancy server-side features.

This backend is powered by the [**Server Plugin**](https://robojs.dev/plugins/server) - a powerful Robo plugin that creates an manages a Node `http` server for you. If you install Fastify, the server will automatically switch to it for better performance!

Everything Robo is file-based, so you can create new routes by making new files in the `/src/api` directory. The file's name becomes the route's path. For example, let's try making a new route at `/health` by creating a new file named `health.js`:

```js
export default () => {
	return { status: 'ok' }
}
```

Easy, right? Check out the [**Server Plugin documentation**](https://docs.roboplay.dev/plugins/server) for more info!

## Folder Structure 📁

While the `api` and `app` folders are reserved for your server and client-side code, you are free to create anything else in the `/src` directory!

Folders only become reserved when you install a plugin that uses them. For example, bot functionality uses the `commands` and `events` folders.

## Plugins 🔌

This Robo boasts an intuitive plugin system that grants new capabilities instantly!

```bash
npx robo add @robojs/ai
```

> Swap out [`@robojs/ai`](https://robojs.dev/plugins/ai) with your chosen plugin's package name

With that, your Robo automatically equips itself with all the features the plugin offers. Want to revert? Simply use [`robo remove`](https://robojs.dev/cli/robo#plugins) to uninstall any plugin.

Crafting something unique in your Robo project? You can turn your innovations into plugins, be it specific functionalities or your entire Robo. Share your genius with the world!

- [📚 **Documentation:** Installing plugins](https://robojs.dev/plugins/install)
- [📚 **Documentation:** Creating plugins](https://robojs.dev/plugins/create)

## Deployment 🚀

Run the `deploy` command to automatically deploy to **[RoboPlay](https://roboplay.dev)** once you're ready to keep your robo online 24/7.

```bash
npm run deploy
```

You can also self-host your robo anywhere that supports Node. Just make sure to run `build` followed by `start`:

```bash
npm run build
npm start
```

- [🚀 **RoboPlay:** Hosting your Robo](https://robojs.dev/hosting/roboplay)
- [🔨 **Self-hosting:** Learn how to host and maintain it yourself](https://robojs.dev/hosting/self-host)
