# Class: ManyEngines

## Extends

- `BaseEngine`

## Constructors

### new ManyEngines()

```ts
new ManyEngines(...engines): ManyEngines
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`engines` | `BaseEngine`[] |

#### Returns

[`ManyEngines`](Class.ManyEngines.md)

#### Overrides

`BaseEngine.constructor`

## Methods

### event()

```ts
event(name, options?): Promise<void>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `options`? | `EventOptions` |

#### Returns

`Promise`\<`void`\>

#### Overrides

`BaseEngine.event`

***

### view()

```ts
view(page, options?): Promise<void>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `page` | `string` |
| `options`? | `ViewOptions` |

#### Returns

`Promise`\<`void`\>

#### Overrides

`BaseEngine.view`
