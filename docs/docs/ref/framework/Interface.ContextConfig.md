# Interface: ContextConfig

## Extends

- [`BaseConfig`](Interface.BaseConfig.md)

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

### contexts?

```ts
optional contexts: CommandContext[];
```

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

### ~~dmPermission?~~

```ts
optional dmPermission: boolean;
```

#### Deprecated

Use `contexts` instead

***

### nameLocalizations?

```ts
optional nameLocalizations: Record<string, string>;
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
