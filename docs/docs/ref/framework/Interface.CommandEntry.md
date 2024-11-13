# Interface: CommandEntry

## Extends

- [`CommandConfig`](Interface.CommandConfig.md)

## Properties

### \_\_auto?

```ts
optional __auto: true;
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`__auto`](Interface.CommandConfig.md#__auto)

***

### \_\_module?

```ts
optional __module: string;
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`__module`](Interface.CommandConfig.md#__module)

***

### \_\_path?

```ts
optional __path: string;
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`__path`](Interface.CommandConfig.md#__path)

***

### \_\_plugin?

```ts
optional __plugin: object;
```

| Name | Type |
| ------ | ------ |
| `name` | `string` |
| `path` | `string` |

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`__plugin`](Interface.CommandConfig.md#__plugin)

***

### defaultMemberPermissions?

```ts
optional defaultMemberPermissions: string | number | bigint;
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`defaultMemberPermissions`](Interface.CommandConfig.md#defaultmemberpermissions)

***

### description?

```ts
optional description: string;
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`description`](Interface.CommandConfig.md#description)

***

### descriptionLocalizations?

```ts
optional descriptionLocalizations: Record<string, string>;
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`descriptionLocalizations`](Interface.CommandConfig.md#descriptionlocalizations)

***

### dmPermission?

```ts
optional dmPermission: boolean;
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`dmPermission`](Interface.CommandConfig.md#dmpermission)

***

### nameLocalizations?

```ts
optional nameLocalizations: Record<string, string>;
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`nameLocalizations`](Interface.CommandConfig.md#namelocalizations)

***

### options?

```ts
optional options: readonly CommandOption[];
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`options`](Interface.CommandConfig.md#options)

***

### sage?

```ts
optional sage: false | SageOptions;
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`sage`](Interface.CommandConfig.md#sage)

***

### subcommands?

```ts
optional subcommands: Record<string, CommandEntry>;
```

***

### timeout?

```ts
optional timeout: number;
```

#### Inherited from

[`CommandConfig`](Interface.CommandConfig.md).[`timeout`](Interface.CommandConfig.md#timeout)
