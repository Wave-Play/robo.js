<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# Discord Activity - Godot

Welcome to your fresh **[Robo.js](https://robojs.dev)** project!

Build, deploy, and maintain your **Discord Activities** with ease. With **Robo.js** as your guide, you'll experience a seamless, **[file-based setup](https://robojs.dev/discord-activities/file-structure)**, an **[integrated database](https://robojs.dev/robojs/flashcore)**, **[TypeScript support](https://robojs.dev/robojs/typescript)**, and a **[rich ecosystem](https://robojs.dev/plugins/overview)**.

_Ready to embark on this adventure?_

## Table of Contents

- [🔗 Quick Links](#🔗-quick-links)
- [✨ Getting Started](#✨-getting-started)
- [🛠️ App Development](#️🛠️-app-development)
- [🔒 Authentication](#🔒-authentication)
- [🛠️ Backend Development](#️🛠️-backend-development)
- [📁 Folder Structure](#📁-folder-structure)
- [🔌 Ecosystem](#ecosystem)
- [🚀 Hosting](#hosting)

## 🔗 Quick Links

- [📚 **Documentation:** Getting started with Robo.js](https://robojs.dev/discord-activities)
- [✨ **Discord:** Robo - Imagine Magic](https://robojs.dev/discord)
- [🔗 **Templates:** Kickstart your project with a template.](https://robojs.dev/plugins/create)
- [📖 **Tutorials:** Learn how to create epic experiences.](https://dev.to/waveplay)

## ✨ Getting Started

Create a project with this template, replacing `<project-name>` with your desired name:

```bash
npx create-robo <project-name> --template discord-activities/godot
```

Then navigate into your project directory:

```bash
cd <project-name>
```

Run development mode:

```bash
npm run dev
```

## 🛠️ App Development

You can find your client-side code in the `/src/app` folder. This is where you can build your web app using React, Vue, or any other front-end framework.

Things are powered by Vite under the hood, so you get the latest ES modules, hot module reloading, and more! ⚡

Try editing the `main` file to get started! (`Activity.tsx` if you're using React)

### 🎮 Connecting your Godot game

1. Open your Godot project and add/select the Web export template.
2. Configure the export settings for your Godot project.
   - Note if using Godot 4, <strong> you must disable `Thread Support` </strong>
3. Export your Godot project as a Web build and locate the generated files. <small>(Recommended to disable `Export With Debug`)</small>
4. Copy/Move generated files to the `/public` folder
   - Feel free to delete `Game/Testing` <small>(it's just a demo)</small>
   - only `.js`, `.wasm`, and `.pck` files required
   - `.html` not needed; <small> (You can find file sizes in `const GODOT_CONFIG =`)</small>
5. update `useGodot` hook in `src/app/Activity.tsx` to point to your Godot project.
   example: Say my game is in `public/Game/` and named `Testing`;
   ```js
   const { startGame, loading } = useGodot('/Game/Testing', { pck: 1779104, wasm: 43016933 })
   ```
   file sizes are optional, but needed if you want progress percentage

- [📚 Godot Docs](https://docs.godotengine.org/en/stable/index.html)
- [🏠 Homepage](https://godotengine.org/)

### 🧵 Accessing discord sdk in Godot

In React you pass the discord sdk to window for use in Godot

```ts
const { discordSdk, status, accessToken, session } = useDiscordSdk()
useEffect(() => {
	window.discord = {
		sdk: discordSdk,
		accessToken,
		session,
		status
	}
}, [discordSdk, status, accessToken, session])
```

In Godot, you can access the discord sdk via the [JavaScriptBridge singleton](https://docs.godotengine.org/en/stable/tutorials/platform/web/javascript_bridge.html)

```GDScript
   var discord = JavaScriptBridge.get_interface("discord")
```

#### 🔒 Authentication

The React template makes it easy to authenticate your activity with Discord. The `<DiscordProvider>` components in `App.tsx` accepts `authenticate` and `scope` props.

```tsx
<DiscordContextProvider authenticate scope={['identify', 'guilds']}>
	<Activity />
</DiscordContextProvider>
```

You can then get the SDK and other goodies from the `useDiscordSdk` hook!

- [🔒 **Authentication:** Customize your user experience.](https://robojs.dev/discord-activities/authentication)

## 🛠️ Backend Development

Your server-side code is located in the `/src/api` folder. This is where you can build your API, webhooks, and other fancy server-side features.

This backend is powered by [**@robojs/server**](https://robojs.dev/plugins/server) - a powerful Robo plugin that creates an manages a Node `http` server for you. If you install Fastify, the server will automatically switch to it for better performance!

Everything Robo is file-based, so you can create new routes by making new files in the `/src/api` directory. The file's name becomes the route's path. For example, let's try making a new route at `/health` by creating a new file named `health.js`:

```js
export default () => {
	return { status: 'ok' }
}
```

- [🔌 **@robojs/server:** Create and manage web pages, APIs, and more.](https://robojs.dev/plugins/server)

## 📁 Folder Structure

While the `api` and `app` folders are reserved for your server and client-side code, you are free to create anything else in the `/src` directory!

Folders only become reserved when you install a plugin that uses them. For example, bot functionality uses the `commands` and `events` folders.

## Robo Ecosystem

By building with **Robo.js**, you gain access to a growing ecosystem of **[plugins](https://robojs.dev/plugins/directory)**, **[templates](https://robojs.dev/templates/overview)**, and **[tools](https://robojs.dev/cli/overview)**. **[Robo Plugins](https://robojs.dev/plugins/overview)** are special. They can add features with one command.

```bash
npx robo add @robojs/ai @robojs/sync
```

Plugins integrate seamlessly thanks to the **[Robo File Structure](https://robojs.dev/discord-bots/file-structure)**. What's more, anyone can **[create a plugin](https://robojs.dev/plugins/create)**.

- [🔌 **Robo Plugins:** Add features to your Robo seamlessly.](https://robojs.dev/plugins/install)
- [🔌 **Creating Plugins:** Make your own plugins for Robo.js.](https://robojs.dev/plugins/create)
- [🗃️ **Plugin Directory:** Browse plugins for your Robo.](https://robojs.dev/plugins/create)
- [🔗 **Templates:** Kickstart your project with a template.](https://robojs.dev/plugins/create)

## Hosting

**Hosting** your project keeps it running 24/7. No need to keep your computer on at all times, or worry about your Internet connection.

You can host on any platform that supports **Node.js**, or run [`robo deploy`](https://robojs.dev/cli/robo#distributing) to host on **[RoboPlay](https://roboplay.dev)** - a hosting platform optimized for **Robo.js**.

```bash
npm run deploy
```

- [🚀 **RoboPlay:** Deploy with as little as one command.](https://robojs.dev/hosting/roboplay)
- [🛠️ **Self-Hosting:** Learn how to host and maintain it yourself.](https://robojs.dev/hosting/overview)
