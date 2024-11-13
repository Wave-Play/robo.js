# Variable: Mode

```ts
const Mode: Readonly<object>;
```

Modes are a way to define "profiles" for your Robo session. Each with its own config(s), envionment variables, and code.

```ts
import { Mode } from 'robo.js'

// Get the current mode
const mode = Mode.get()

// Check if the current mode is "dev"
if (Mode.is('dev')) {
 // Do something
}

// Colorize text based on the current mode
console.log(Mode.color('Hello, world!'))
```

Everything is granular. You can even run multiple modes at the same time!

[**Learn more:** Mode](https://robojs.dev/robojs/mode)

## Type declaration

### color()

```ts
color: (text) => string = colorMode;
```

Returns the color function for the current mode.
This is used to colorize logs based on the mode when multiple exist.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

`string`

### get()

```ts
get: () => string;
```

The current mode this Robo instance is running in.
This is set by the `--mode` CLI flag.

Defaults to `production` for `robo start` and `development` for `robo dev`.

#### Returns

`string`

### is()

```ts
is: (mode) => boolean;
```

Checks if the current mode matches the provided mode.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `mode` | `string` | The mode to check against. |

#### Returns

`boolean`

`true` if the current mode matches the provided mode.
