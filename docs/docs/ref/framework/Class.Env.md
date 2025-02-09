# Class: Env\<T\>

Sometimes you need to store sensitive information, like API keys, database URLs, or Discord Credentials.

```ts
import { Env } from 'robo.js'

Env.loadSync({ mode: 'dev' })
Env.data().NODE_ENV // 'development'
```

Use the `Env` class to load environment variables from a file and access them in a type-safe way.

[**Learn more:** Environment Variables](https://robojs.dev/robojs/environment-variables)

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Constructors

### new Env()

```ts
new Env<T>(schema): Env<T>
```

Creates a new instance of the Env class with the specified schema with type-checking and default values.

```ts
const env = new Env({
	discord: {
		clientId: { env: 'DISCORD_CLIENT_ID' }
	},
	example: {
		default: 'This is an example',
		env: 'EXAMPLE_ENV'
	},
	nodeEnv: { env: 'NODE_ENV' }
})

// Returns the value of the DISCORD_CLIENT_ID environment variable
env.get('discord.clientId')
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `schema` | `T` | The schema of environment variables to use for type-checking and default values. |

#### Returns

[`Env`](Class.Env.md)\<`T`\>

## Methods

### get()

```ts
get<K>(key): ValueAtPath<T, K>
```

Retrieves the value of the environment variable specified by the dot-separated key.
If the environment variable is not set, it returns the default value if provided.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* `string` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `K` | The dot-separated path to the environment variable in the schema. |

#### Returns

`ValueAtPath`\<`T`, `K`\>

The value of the environment variable or its default.

***

### data()

```ts
static data(): Record<string, string>
```

#### Returns

`Record`\<`string`, `string`\>

The environment variables that have been loaded most recently.

***

### load()

```ts
static load(options): Promise<Record<string, string>>
```

Loads environment variables from a file and applies them to the current process.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `LoadOptions` | Customize where the file path, mode, and overwrite behavior. |

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

Record object containing loaded environment variables.

***

### loadSync()

```ts
static loadSync(options): Record<string, string>
```

Loads environment variables from a file and applies them to the current process.

**This operation is synchronous and will block the event loop.** Use [load](Class.Env.md#load) for asynchronous loading.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `LoadOptions` | Customize where the file path, mode, and overwrite behavior. |

#### Returns

`Record`\<`string`, `string`\>

Record object containing loaded environment variables.
