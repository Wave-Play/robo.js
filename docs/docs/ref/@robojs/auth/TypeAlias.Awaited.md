# Type Alias: Awaited\<T\>

```ts
type Awaited<T>: T extends Promise<infer U> ? U : T;
```

## Type Parameters

| Type Parameter |
| ------ |
| `T` |
