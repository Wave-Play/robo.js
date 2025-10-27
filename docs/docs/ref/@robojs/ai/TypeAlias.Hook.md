# Type Alias: Hook()

```ts
type Hook: (context, iteration) => Promise<ChatMessage[]>;
```

Hook function invoked during message orchestration. Hooks can adjust the message array before each
attempt, enabling preprocessing, safety filters, or analytics.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `context` | `HookContext` | Mutable hook context containing the latest message sequence. |
| `iteration` | `number` | Zero-based retry counter indicating which attempt is currently running. |

## Returns

`Promise`\<[`ChatMessage`](Interface.ChatMessage.md)[]\>

A promise resolving with the updated message array for the next handler stage.

## Example

```ts
engine.on('chat', async (ctx) => {
  ctx.messages.unshift({ role: 'system', content: 'Follow Robo safety policies.' })
  return ctx.messages
})
```
