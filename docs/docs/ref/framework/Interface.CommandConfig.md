# Interface: CommandConfig

## Extends

- [`BaseConfig`](Interface.BaseConfig.md)

## Extended by

- [`CommandEntry`](Interface.CommandEntry.md)

## Properties

### \_\_auto?

```ts
optional __auto: true;
```

#### Inherited from

[`BaseConfig`](Interface.BaseConfig.md).[`__auto`](Interface.BaseConfig.md#__auto)

***

### \_\_module?

```ts
optional __module: string;
```

#### Inherited from

[`BaseConfig`](Interface.BaseConfig.md).[`__module`](Interface.BaseConfig.md#__module)

***

### \_\_path?

```ts
optional __path: string;
```

#### Inherited from

[`BaseConfig`](Interface.BaseConfig.md).[`__path`](Interface.BaseConfig.md#__path)

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

[`BaseConfig`](Interface.BaseConfig.md).[`__plugin`](Interface.BaseConfig.md#__plugin)

***

### defaultMemberPermissions?

```ts
optional defaultMemberPermissions: string | number | bigint;
```

***

### description?

```ts
optional description: string;
```

#### Inherited from

[`BaseConfig`](Interface.BaseConfig.md).[`description`](Interface.BaseConfig.md#description)

***

### descriptionLocalizations?

```ts
optional descriptionLocalizations: Record<string, string>;
```

***

### dmPermission?

```ts
optional dmPermission: boolean;
```

***

### nameLocalizations?

```ts
optional nameLocalizations: Record<string, string>;
```

***

### options?

```ts
optional options: readonly CommandOption[];
```

***

### sage?

```ts
optional sage: false | SageOptions;
```

***

### timeout?

```ts
optional timeout: number;
```

#### Overrides

[`BaseConfig`](Interface.BaseConfig.md).[`timeout`](Interface.BaseConfig.md#timeout)
