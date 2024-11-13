# Variable: DiscordProxy

```ts
const DiscordProxy: object;
```

## Type declaration

### patch()

```ts
patch: () => void;
```

Automatically patches all internal requests when in a Discord Activity.
This updates the `fetch` and `WebSocket` APIs to always include the `/.proxy` prefix.

Run this at the very beginning of your app to ensure all requests are proxied.

#### Returns

`void`

### Vite()

```ts
Vite: () => Plugin = VitePlugin;
```

Vite plugin to inject the Discord proxy patch script into the index.html.

In development, the script loads synchronously to ensure patch is applied before Vite's HMR runs.
In production, the script is bundled into the output and referenced from the index.html.

The patch script is equivalent to running:
```js
import { DiscordProxy } from '@robojs/patch'

DiscordProxy.patch()
```

#### Returns

`Plugin`
