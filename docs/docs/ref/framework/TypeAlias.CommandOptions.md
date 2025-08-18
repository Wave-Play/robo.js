# Type Alias: CommandOptions\<ConfigType\>

```ts
type CommandOptions<ConfigType>: { [K in NonNullable<ConfigType["options"]>[number] as K["name"]]: K extends Object ? ValueOfOption<K> : ValueOfOption<K> | undefined };
```

## Type Parameters

| Type Parameter |
| ------ |
| `ConfigType` *extends* [`CommandConfig`](Interface.CommandConfig.md) |
