# Type Alias: TemplateValue\<T\>

```ts
type TemplateValue<T>: MaybePromise<T> | (ctx) => MaybePromise<T>;
```

Template helper value that can be static, lazy, or computed from context.

## Type Parameters

| Type Parameter |
| ------ |
| `T` |
