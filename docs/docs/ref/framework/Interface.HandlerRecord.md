# Interface: HandlerRecord\<T\>

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `unknown` |

## Properties

### auto?

```ts
optional auto: boolean;
```

***

### description?

```ts
optional description: string;
```

***

### handler

```ts
handler: T;
```

***

### key

```ts
key: string;
```

***

### module?

```ts
optional module: string;
```

***

### path

```ts
path: string;
```

***

### plugin?

```ts
optional plugin: object;
```

| Name | Type |
| ------ | ------ |
| `name` | `string` |
| `path` | `string` |

***

### type

```ts
type: 
  | "event"
  | "api"
  | "command"
  | "context"
  | "middleware";
```
