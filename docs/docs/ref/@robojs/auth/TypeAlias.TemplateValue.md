# Type Alias: TemplateValue\<T\>

```ts
type TemplateValue<T>: MaybePromise<T> | (ctx) => MaybePromise<T>;
```

Template helper value that can be static, lazy (Promise), or computed from
the [EmailContext](TypeAlias.EmailContext.md) at render time.

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Examples

```ts
'Welcome to Robo.js'
```

```ts
(ctx) => `Welcome, ${ctx.user.name ?? 'friend'}`
```

```ts
async () => fetchCopyFromCMS()
```
