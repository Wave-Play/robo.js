# Type Alias: CommandOptions\<ConfigType\>

```ts
type CommandOptions<ConfigType>: { [K in NonNullable<ConfigType["options"]>[number] as K["name"]]: K extends Object ? TypeName extends keyof CommandOptionTypes ? CommandOptionTypes[TypeName] : string : K extends Object ? TypeName extends keyof CommandOptionTypes ? CommandOptionTypes[TypeName] | undefined : string | undefined : K extends Object ? string : string | undefined };
```

## Type Parameters

| Type Parameter |
| ------ |
| `ConfigType` *extends* [`CommandConfig`](Interface.CommandConfig.md) |
