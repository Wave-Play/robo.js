# Variable: Analytics

```ts
const Analytics: Readonly<object>;
```

## Type declaration

### event()

```ts
event: (name, options?) => void | Promise<void>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `options`? | `EventOptions` |

#### Returns

`void` \| `Promise`\<`void`\>

### isReady()

```ts
isReady: () => boolean;
```

#### Returns

`boolean`

### view()

```ts
view: (page, options?) => void | Promise<void>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `page` | `string` |
| `options`? | `ViewOptions` |

#### Returns

`void` \| `Promise`\<`void`\>
