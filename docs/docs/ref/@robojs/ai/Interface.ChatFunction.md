# Interface: ChatFunction

Definition describing an available tool or function call that an engine may invoke.

## Properties

### description

```ts
description: string;
```

Human-readable description surfaced to the model.

***

### name

```ts
name: string;
```

Programmatic identifier for the function.

***

### parameters

```ts
parameters: ChatFunctionParameters;
```

JSON schema describing the function arguments.
