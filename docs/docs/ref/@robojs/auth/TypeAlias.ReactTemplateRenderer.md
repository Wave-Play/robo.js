# Type Alias: ReactTemplateRenderer()

```ts
type ReactTemplateRenderer: (ctx) => MaybePromise<ReactTemplateResult>;
```

Function signature for generating React email output using react-email
components. Return JSX (sync or async) which the runtime renders to HTML via
`react-dom/server`. Requires `@react-email/components` in your project.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`EmailContext`](TypeAlias.EmailContext.md) |

## Returns

[`MaybePromise`](TypeAlias.MaybePromise.md)\<[`ReactTemplateResult`](TypeAlias.ReactTemplateResult.md)\>

## See

https://react.email
