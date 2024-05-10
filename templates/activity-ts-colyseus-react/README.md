<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# Hiya, activity-ts-colyseus-react 🌈

Welcome to your fresh **[Robo.js](https://github.com/Wave-Play/robo)** project, empowered by [**Colyseus**](https://colyseus.io) for seamless, real-time state management in your Discord activities!

Colyseus is a robust multiplayer game server for Node.js. It handles complex and demanding real-time data synchronization tasks, making it an ideal choice for developing interactive, multiplayer Discord activities. With its lightweight and scalable architecture, Colyseus facilitates the development of distributed systems and real-time applications, providing a powerful solution for managing state synchronization across multiple clients efficiently.

With Robo.js as your guide, you'll experience a seamless, [file-based setup](https://docs.roboplay.dev/docs/basics/overview#the-robojs-file-structure), an [integrated database](https://docs.roboplay.dev/docs/basics/flashcore), [TypeScript support](https://docs.roboplay.dev/docs/advanced/typescript), and a multitude of [plugin-powered skills](https://docs.roboplay.dev/docs/advanced/plugins) to unlock along the way.

Ready to embark on this adventure?

➞ [📖 **Tutorial:** Creating a Discord Activity in seconds](https://dev.to/waveplay/how-to-build-a-discord-activity-easily-with-robojs-5bng)

➞ [📚 **Documentation:** Getting started with Robo](https://docs.roboplay.dev/docs/getting-started)

➞ [📚 **Documentation:** Best practices for Colyseus](https://docs.colyseus.io/best-practices/)

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)

## Running 🏃‍♂️

Run development mode with:

```bash
npm run dev
```

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

## Why Colyseus? 👀

Colyseus simplifies the development of your Discord activity by managing and synchronizing state across clients in real time. This allows you to focus on creating engaging content rather than the complexities of network management.

Rendering users' avatars and showing a green circle those talking is cool and all, but you can take it further! Whether you're planning to stay in "react-land" or venture into Unity, Godot, Cocos, or other game engines, this basic example is a great starting point.

**➞** [⚔ **Colyseus:** Official client integrations](https://github.com/colyseus/colyseus#%EF%B8%8F-official-client-integration)

## Expanding Your Game Logic 🎮

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
