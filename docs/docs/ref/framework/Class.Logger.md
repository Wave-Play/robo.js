# Class: Logger

## Constructors

### new Logger()

```ts
new Logger(options?): Logger
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options`? | `LoggerOptions` |

#### Returns

[`Logger`](Class.Logger.md)

## Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| `_customLevels` | `protected` | `Record`\<`string`, `CustomLevel`\> |
| `_enabled` | `protected` | `boolean` |
| `_level` | `protected` | `string` |
| `_levelValues` | `protected` | `Record`\<`string`, `number`\> |
| `_parent` | `protected` | [`Logger`](Class.Logger.md) |
| `_prefix` | `protected` | `string` |

## Methods

### \_log()

```ts
protected _log(
   prefix, 
   level, ...
   data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `prefix` | `string` |
| `level` | `string` |
| ...`data` | `unknown`[] |

#### Returns

`void`

***

### custom()

```ts
custom(level, ...data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `level` | `string` |
| ...`data` | `unknown`[] |

#### Returns

`void`

***

### debug()

```ts
debug(...data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`data` | `unknown`[] |

#### Returns

`void`

***

### error()

```ts
error(...data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`data` | `unknown`[] |

#### Returns

`void`

***

### event()

```ts
event(...data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`data` | `unknown`[] |

#### Returns

`void`

***

### flush()

```ts
flush(): Promise<void>
```

Waits for all pending log writes to complete.

#### Returns

`Promise`\<`void`\>

***

### fork()

```ts
fork(prefix): Logger
```

Creates a new logger instance with the specified prefix.
This is useful for creating a logger for a specific plugin, big features, or modules.

All writes and cached logs will be delegated to the parent logger, so debugging will still work.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `prefix` | `string` | The prefix to add to the logger (e.g. 'my-plugin') |

#### Returns

[`Logger`](Class.Logger.md)

A new logger instance with the specified prefix

***

### getLevel()

```ts
getLevel(): string
```

#### Returns

`string`

***

### getLevelValues()

```ts
getLevelValues(): Record<string, number>
```

#### Returns

`Record`\<`string`, `number`\>

***

### getRecentLogs()

```ts
getRecentLogs(count): LogEntry[]
```

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `count` | `number` | `50` |

#### Returns

`LogEntry`[]

***

### info()

```ts
info(...data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`data` | `unknown`[] |

#### Returns

`void`

***

### log()

```ts
log(...data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`data` | `unknown`[] |

#### Returns

`void`

***

### ready()

```ts
ready(...data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`data` | `unknown`[] |

#### Returns

`void`

***

### setDrain()

```ts
setDrain(drain): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `drain` | [`LogDrain`](TypeAlias.LogDrain.md) |

#### Returns

`void`

***

### setup()

```ts
setup(options?): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options`? | `LoggerOptions` |

#### Returns

`void`

***

### trace()

```ts
trace(...data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`data` | `unknown`[] |

#### Returns

`void`

***

### wait()

```ts
wait(...data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`data` | `unknown`[] |

#### Returns

`void`

***

### warn()

```ts
warn(...data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`data` | `unknown`[] |

#### Returns

`void`
