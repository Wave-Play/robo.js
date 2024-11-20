<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/sync

Real-time state sync across clients the simplest way possible. Perfect for multiplayer games and chat apps. It's like magic, but real! 🎩✨

```ts
const [position, setPosition] = useSyncState({ x: 0, y: 0 }, [channelId])
```

It works exactly like React's `useState`, but it syncs the state across all clients in real-time using websockets, sharing the same state across all clients with the same dependency array. (In this case, `[channelId]`)

No more manual websocket handling or state synchronization. Just focus on building your app and let `@robojs/sync` handle the rest. It works out of the box as long as you also have the `@robojs/server` plugin installed.

➞ [📚 **Documentation:** Getting started](https://docs.roboplay.dev/docs/getting-started)

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)

## Installation 💻

To install this plugin, navigate to your existing Robo project's directory and run the following command:

```bash
npx robo add @robojs/sync
```

> **Note:** You will also need to install the `@robojs/server`.

That's it! You can now start using `useSyncState` in your project. Just wrap your App component with the `SyncContextProvider` and you're good to go!

```tsx
import { SyncContextProvider } from '@robojs/sync'

export function App() {
	return (
		<SyncContextProvider>
			<Activity />
		</SyncContextProvider>
	)
}
```

## Usage 🎨

Here's a simple example of how you can use `useSyncState` in your project to share the mouse position across all clients:

```tsx
import { useSyncState } from '@robojs/sync'
import { useDiscordSdk } from '../hooks/useDiscordSdk'

export function Player() {
	const { session } = useDiscordSdk()
	const [position, setPosition] = useSyncState({ x: 0, y: 0 }, ['position'])

	const handleMouseMove = (event) => {
		setPosition({ x: event.clientX, y: event.clientY })
	}

	return (
		<div
			onMouseMove={handleMouseMove}
			style={{
				width: '100vw',
				height: '100vh'
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: position.x,
					top: position.y
				}}
			>
				Player
			</div>
		</div>
	)
}
```

The provider accepts an optional `loadingScreen` prop, which is a component to display while the websocket connection is being established.

```tsx
<SyncContextProvider loadingScreen={<LoadingScreen />}>
	<Activity />
</SyncContextProvider>
```

We also expose a way to manually start and get the websocket connection:

```tsx
import { SyncServer } from '@robojs/sync/server.js'

// To manually start the websocket server
SyncServer.start()

// To get the underlying websocket server
const wss = SyncServer.getSocketServer()
```

## Need more power? ⚡

We highly recommend checking out [**Colyseus**](https://colyseus.io/), a powerful multiplayer game server! It's the perfect companion to `@robojs/sync` for building real-time multiplayer games.

➞ [⚔ **Colyseus:** Multiplayer Game Server](https://colyseus.io/)

➞ [📚 **Template:** Colyseus Discord Activity](https://github.com/Wave-Play/robo.js/tree/main/templates/activity-ts-colyseus-react)

Enjoy your enhanced Robo! 🚀

> **Don't have a Robo project?** [Create your own!](https://docs.roboplay.dev/docs/getting-started)
