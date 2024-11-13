# Variable: Robo

```ts
const Robo: object;
```

Robo is the main entry point for your bot. It provides a simple API for starting, stopping, and restarting your Robo.

```ts
import { Robo } from 'robo.js'

Robo.start()
```

You do not normally need to use this API directly, as the CLI will handle starting and stopping for you.

[**Learn more:** Robo](https://robojs.dev/discord-bots/migrate)

## Type declaration

### restart()

```ts
restart: () => Promise<void>;
```

Restarts your Robo instance gracefully. Similar to making changes with `robo dev` and restarting.

#### Returns

`Promise`\<`void`\>

A promise that resolves when Robo has restarted

### start()

```ts
start: (options?) => Promise<void>;
```

Starts your Robo instance. Similar to running `robo start` from the CLI.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options`? | `StartOptions` | Options for starting your Robo instance |

#### Returns

`Promise`\<`void`\>

A promise that resolves when Robo has started

### stop()

```ts
stop: (exitCode) => Promise<void>;
```

Stops your Robo instance gracefully. Similar to pressing `Ctrl+C` in the terminal.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `exitCode` | `number` | `0` | The exit code to use when stopping Robo |

#### Returns

`Promise`\<`void`\>
