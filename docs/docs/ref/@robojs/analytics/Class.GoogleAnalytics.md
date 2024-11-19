# Class: GoogleAnalytics

## Extends

- `BaseEngine`

## Constructors

### new GoogleAnalytics()

```ts
new GoogleAnalytics(options?): GoogleAnalytics
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options`? | `GoogleAnalyticsOptions` |

#### Returns

[`GoogleAnalytics`](Class.GoogleAnalytics.md)

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
