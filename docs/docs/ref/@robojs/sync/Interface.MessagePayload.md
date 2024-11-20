# Interface: MessagePayload\<T\>

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `unknown` \| `undefined` |

## Properties

### data

```ts
data: T;
```

***

### key?

```ts
optional key: string[];
```

***

### type

```ts
type: 
  | "get"
  | "off"
  | "on"
  | "ping"
  | "pong"
  | "update";
```
