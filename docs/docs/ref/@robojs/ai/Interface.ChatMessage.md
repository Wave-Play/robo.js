# Interface: ChatMessage

Normalized representation of a chat message exchanged with an engine.

## Examples

```ts
const message: ChatMessage = {
  role: 'user',
  content: 'How do I deploy my Robo project?'
}
```

```ts
const message: ChatMessage = {
  role: 'assistant',
  content: '',
  function_call: {
    name: 'deployProject',
    arguments: { target: 'production' }
  }
}
```

## Properties

### content

```ts
content: ChatMessageContent;
```

Raw or structured message payload.

***

### function\_call?

```ts
optional function_call: ChatFunctionCall;
```

Function call issued by the assistant for tool execution.

***

### name?

```ts
optional name: string;
```

Optional author name useful for function-originated replies.

***

### role

```ts
role: "function" | "user" | "assistant" | "system";
```

Role describing the source of the message.
