# Interface: ChatFunctionCall

Invocation payload provided when an engine requests tool execution.

## Properties

### arguments

```ts
arguments: Record<string, unknown>;
```

Parsed arguments adhering to [ChatFunctionParameters](Interface.ChatFunctionParameters.md).

***

### id?

```ts
optional id: string;
```

Identifier supplied when the model tracks a tool call across responses.

***

### name

```ts
name: string;
```

Name of the function to execute.
