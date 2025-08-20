# Interface: SpiritMessage

## Properties

### error?

```ts
optional error: unknown;
```

***

### event?

```ts
optional event: 
  | "ready"
  | "command"
  | "restart"
  | "build"
  | "get-state"
  | "set-state"
  | "start"
  | "stop";
```

***

### logLevel?

```ts
optional logLevel: LogLevel;
```

***

### payload?

```ts
optional payload: unknown;
```

***

### state?

```ts
optional state: Record<string, unknown>;
```

***

### verbose?

```ts
optional verbose: boolean;
```
