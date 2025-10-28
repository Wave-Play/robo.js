# Class: State

States are your Robo's personal memory bank.

```ts
import { State } from 'robo.js'

// Set a value in the state
State.set('key', 'value')

// Get a value from the state
const value = State.get('key')
```

States are ephemerally in-memory; data is lost when stopped but not when restarted.

[**Learn more:** State Management](https://robojs.dev/robojs/state)

## Constructors

### new State()

```ts
new State(prefix, options?): State
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `prefix` | `string` |
| `options`? | `StateOptions` |

#### Returns

[`State`](Class.State.md)

## Methods

### fork()

```ts
fork(prefix, options?): State
```

Creates a new state fork.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `prefix` | `string` | Fork prefix (e.g. 'polls') |
| `options`? | `StateOptions` | Options for the fork (persisting all state by default) |

#### Returns

[`State`](Class.State.md)

- A new state fork you can deconstruct (e.g. `const { getState, setState } = State.fork('polls')`

***

### getState()

```ts
getState<T>(key): T
```

Get a value from the forked state.
If the value does not exist, null is returned.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `string` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key to get the value for. |

#### Returns

`T`

The value for the given key, or null if the key does not exist.

***

### setState()

```ts
setState<T>(
   key, 
   value, 
   options?): void
```

Set a value in the forked state.
When the persist option is set to true, the state will be persisted to disk.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key to set the value for. |
| `value` | `T` | The value to set. |
| `options`? | `SetStateOptions` | Options for setting the state. (Persisting to disk) |

#### Returns

`void`

***

### \_\_resetForTests()

```ts
static __resetForTests(): void
```

**`Internal`**

#### Returns

`void`

***

### fork()

```ts
static fork(prefix, options?): State
```

Creates a new state fork.
This is useful for preventing state collisions between different parts of the Robo.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `prefix` | `string` | Fork prefix (e.g. 'polls') |
| `options`? | `StateOptions` | Options for the fork (persisting all state by default) |

#### Returns

[`State`](Class.State.md)

A new state fork you can deconstruct (e.g. `const { getState, setState } = State.fork('polls')`

***

### get()

```ts
static get<T>(key, options?): T
```

Get a value from the forked state.
If the value does not exist, null is returned.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `string` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key to get the value for. |
| `options`? | `GetStateOptions` | - |

#### Returns

`T`

The value for the given key, or null if the key does not exist.

***

### listForks()

```ts
static listForks(): string[]
```

#### Returns

`string`[]

***

### set()

```ts
static set<T>(
   key, 
   value, 
   options?): void
```

Set a value in the forked state.
When the persist option is set to true, the state will be persisted to disk.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key to set the value for. |
| `value` | `T` | The value to set. |
| `options`? | `SetStateOptions` | Options for setting the state. (Persisting to disk) |

#### Returns

`void`
