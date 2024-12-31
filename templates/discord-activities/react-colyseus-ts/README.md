<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# Discord Activity - React, Colyseus (TS)

Welcome to your fresh **[Robo.js](https://robojs.dev/)** project, empowered by [**Colyseus**](https://colyseus.io) for seamless, real-time state management in your Discord activities!

**Colyseus** is a powerful **Node.js** multiplayer game server optimized for real-time data synchronization, making it perfect for interactive, **[multiplayer Discord Activities](https://robojs.dev/discord-activities/multiplayer)**. Its scalable architecture allows efficient state management across multiple clients.

With **Robo.js** as your framework, you benefit from a **[file-based setup](https://robojs.dev/robojs/files)**, an **[integrated database](https://robojs.dev/robojs/flashcore)**, **[TypeScript support](https://robojs.dev/robojs/typescript)**, and flexible **[plugin-powered features](https://robojs.dev/plugins/overview)**, streamlining your development process.

_Ready to embark on this adventure?_

## Table of Contents

- [🔗 Quick Links](#🔗-quick-links)
- [✨ Getting Started](#✨-getting-started)
- [🛠️ App Development](#️🛠️-app-development)
- [🔒 Authentication](#🔒-authentication)
- [🛠️ Backend Development](#️🛠️-backend-development)
- [📁 Folder Structure](#📁-folder-structure)
- [👀 Why Colyseus?](#👀-why-colyseus)
- [🎮 Expanding Your Game Logic](#🎮-expanding-your-game-logic)
- [🔌 Ecosystem](#ecosystem)
- [🚀 Hosting](#hosting)

## 🔗 Quick Links

- [📚 **Documentation:** Getting started with Robo.js](https://robojs.dev/discord-activities)
- [✨ **Discord:** Robo - Imagine Magic](https://robojs.dev/discord)
- [📚 **Documentation:** Best practices for Colyseus](https://docs.colyseus.io/best-practices/)
- [📖 **Tutorials:** Learn how to create epic experiences.](https://dev.to/waveplay)

## ✨ Getting Started

Create a project with this template, replacing `<project-name>` with your desired name:

```bash
npx create-robo --template discord-activities/react-colyseus-ts --name <project-name>
```

Then navigate into your project directory:

```bash
cd <project-name>
```

Run development mode:

```bash
npm run dev
```

> **Notes:** A free Cloudflare tunnel is included for easy testing. You can copy and paste it into activity's **[URL mapping](https://robojs.dev/discord-activities/proxy#url-mapping)** to test things out.

- [🔰 **Beginner Guide:** New to Discord Activities with Robo? Start here!](https://robojs.dev/discord-activities/beginner-guide)
- [🎭 **Run Modes:** Define profiles for your Robo session.](https://robojs.dev/robojs/mode#default-modes)

## 🛠️ App Development

You can find your client-side code in the `/src/app` folder. This is where you can build your web app using React, Vue, or any other front-end framework.

Things are powered by Vite under the hood, so you get the latest ES modules, hot module reloading, and more! ⚡

Try editing the `main` file to get started! (`Activity.tsx` if you're using React)

## 🔒 Authentication

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

Easy, right?

- [🔌 **@robojs/server:** Create and manage web pages, APIs, and more.](https://robojs.dev/plugins/server)

## 📁 Folder Structure

While the `api` and `app` folders are reserved for your server and client-side code, you are free to create anything else in the `/src` directory!

Folders only become reserved when you install a plugin that uses them. For example, bot functionality uses the `commands` and `events` folders.

## 👀 Why Colyseus?

Colyseus simplifies the development of your Discord activity by managing and synchronizing state across clients in real time. This allows you to focus on creating engaging content rather than the complexities of network management.

Rendering users' avatars and showing a green circle those talking is cool and all, but you can take it further! Whether you're planning to stay in "react-land" or venture into Unity, Godot, Cocos, or other game engines, this basic example is a great starting point.

**➞** [⚔ **Colyseus:** Official client integrations](https://github.com/colyseus/colyseus#%EF%B8%8F-official-client-integration)

## 🎮 Expanding Your Game Logic

Want to add position (x, y) to each player and allow them to move? Piece of cake for Colyseus! Here's how you can do it:

- Extend `Player.ts`' schema to include x and y as numbers

```diff
--- a/src/entities/Player.ts
+++ b/src/entities/Player.ts
@@ -1,6 +1,6 @@
 import {Schema, type} from '@colyseus/schema';

-export type TPlayerOptions = Pick<Player, 'sessionId' | 'userId' | 'name' | 'avatarUri' | 'talking'>
+export type TPlayerOptions = Pick<Player, 'sessionId' | 'userId' | 'name' | 'avatarUri' | 'talking' | 'x' | 'y'>

 export class Player extends Schema {
   @type('string')
@@ -18,6 +18,12 @@ export class Player extends Schema {
   @type('boolean')
   public talking: boolean = false;

+  @type('number')
+  public x: number;
+
+  @type('number')
+  public y: number;
+
   constructor({name, userId, avatarUri, sessionId}: TPlayerOptions) {
     super();
@@ -25,5 +31,7 @@ export class Player extends Schema {
     this.avatarUri = avatarUri;
     this.name = name;
     this.sessionId = sessionId;
+    this.x = Math.round(Math.random() * 1_000);
+    this.y = Math.round(Math.random() * 1_000);
   }
 }
```

- Make a keyboard event listener to send "move" commands to the server when arrow keys are pressed

```diff
--- a/src/app/Activity.tsx
+++ b/src/app/Activity.tsx
@@ -2,9 +2,41 @@
+import { useEffect } from 'react'
 import { Player } from './Player'
-import { usePlayers } from '../hooks/usePlayers'
+import { useGameContext, usePlayers } from '../hooks/usePlayers'

 export const Activity = () => {
   const players = usePlayers()
+  const { room } = useGameContext()
+
+  useEffect(() => {
+    function handleKeyDown(ev: KeyboardEvent) {
+      switch (ev.key) {
+        case 'ArrowUp':
+        case 'KeyW':
+          room.send('move', { x: 0, y: 1 })
+          break
+        case 'ArrowDown':
+        case 'KeyS':
+          room.send('move', { x: 0, y: -1 })
+          break
+        case 'ArrowLeft':
+        case 'KeyA':
+          room.send('move', { x: -1, y: 0 })
+          break
+        case 'ArrowRight':
+        case 'KeyD':
+          room.send('move', { x: 1, y: 0 })
+          break
+        default:
+          break
+      }
+    }
+
+    document.addEventListener('keydown', handleKeyDown)
+    return () => {
+      document.removeEventListener('keydown', handleKeyDown)
+    }
+  }, [room])

   return (
     <div className="voice__channel__container">
```

- Update `StateHandlerRoom.ts` to handle "move" events from clients

```diff
--- a/src/rooms/StateHandlerRoom.ts
+++ b/src/rooms/StateHandlerRoom.ts
@@ -16,6 +16,10 @@ export class StateHandlerRoom extends Room<State> {
     this.onMessage('stopTalking', (client, _data) => {
       this.state.stopTalking(client.sessionId)
     })
+
+    this.onMessage('move', (client, data) => {
+      this.state.movePlayer(client.sessionId, data)
+    })
   }

   onAuth(_client: any, _options: any, _req: any) {
```

- Create a command to allow moving a player in `State.ts`

```diff
--- a/src/entities/State.ts
+++ b/src/entities/State.ts
@@ -56,4 +56,15 @@ export class State extends Schema {
       player.talking = false
     }
   }
+
+  movePlayer(sessionId: string, movement: {x: number; y: number}) {
+    const player = this._getPlayer(sessionId)
+
+    if (player != null) {
+      if (movement.x) {
+        player.x += movement.x
+      } else if (movement.y) {
+        player.y += movement.y
+      }
+    }
+  }
 }
```

- Update the UI to consume the stateful updates to each player

```diff
--- a/src/components/Player.tsx
+++ b/src/components/Player.tsx
@@ -2,13 +2,15 @@ import type { TPlayerOptions } from '../entities/Player'

-export function Player({ avatarUri, name, talking }: TPlayerOptions) {
+export function Player({ avatarUri, name, talking, x, y }: TPlayerOptions) {
   return (
     <div className="player__container">
       <div className={`player__avatar ${talking ? 'player__avatar__talking' : ''}`}>
         <img className="player__avatar__img" src={avatarUri} width="100%" height="100%" />
       </div>
-      <div>{name}</div>
+      <div>
+        {x}, {y}, {name}
+      </div>
     </div>
   )
 }
```

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
