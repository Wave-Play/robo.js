# Class: PlausibleAnalytics

## Extends

- `BaseEngine`

## Constructors

### new PlausibleAnalytics()

```ts
new PlausibleAnalytics(domain?): PlausibleAnalytics
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `domain`? | `string` |

#### Returns

[`PlausibleAnalytics`](Class.PlausibleAnalytics.md)

#### Overrides

`BaseEngine.constructor`

## Methods

### event()

```ts
event(name, options): Promise<void>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `options` | `EventOptions` |

#### Returns

`Promise`\<`void`\>

#### Overrides

`BaseEngine.event`

***

### view()

```ts
view(page, options): Promise<void>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `page` | `string` |
| `options` | `ViewOptions` |

#### Returns

`Promise`\<`void`\>

#### Overrides

`BaseEngine.view`
