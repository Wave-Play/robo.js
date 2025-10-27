# Class: TokenLimitError

Error thrown when a `block` mode limit has been exceeded.

## Examples

```ts
try {
  await AI.chat(options)
} catch (error) {
  if (error instanceof TokenLimitError) {
    console.warn(error.displayMessage)
  }
}
```

```ts
tokenLedger.configure({
  limits: { perModel: { 'gpt-4o': { window: 'day', maxTokens: 10_000, mode: 'block' } } }
})
```

## See

tokenLedger.configure

## Extends

- `Error`

## Constructors

### new TokenLimitError()

```ts
new TokenLimitError(context): TokenLimitError
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `context` | [`TokenLimitErrorContext`](Interface.TokenLimitErrorContext.md) | Details describing the breached rule and usage metadata. |

#### Returns

[`TokenLimitError`](Class.TokenLimitError.md)

#### Overrides

`Error.constructor`

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| `message` | `public` | `string` | - | `Error.message` |
| `model` | `readonly` | `string` | Model that exceeded the limit. | - |
| `name` | `public` | `string` | - | `Error.name` |
| `rule` | `readonly` | [`TokenLimitRule`](Interface.TokenLimitRule.md) | Rule that caused the error to be thrown. | - |
| `stack?` | `public` | `string` | - | `Error.stack` |
| `usageKind?` | `readonly` | `string` | Optional usage classification for context. | - |
| `window` | `readonly` | [`TokenSummaryWindow`](TypeAlias.TokenSummaryWindow.md) | Window in which the error was triggered. | - |
| `windowKey` | `readonly` | `string` | Window key describing the offending period. | - |
| `prepareStackTrace?` | `static` | (`err`: `Error`, `stackTraces`: `CallSite`[]) => `any` | Optional override for formatting stack traces **See** https://v8.dev/docs/stack-trace-api#customizing-stack-traces | `Error.prepareStackTrace` |
| `stackTraceLimit` | `static` | `number` | - | `Error.stackTraceLimit` |

## Accessors

### displayMessage

#### Get Signature

```ts
get displayMessage(): string
```

Message suitable for end-user display.

##### Returns

`string`

## Methods

### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void
```

Create .stack property on a target object

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `targetObject` | `object` |
| `constructorOpt`? | `Function` |

#### Returns

`void`

#### Inherited from

`Error.captureStackTrace`
