# Function: createFlashcoreAdapter()

```ts
function createFlashcoreAdapter(options): PasswordAdapter
```

Creates an Auth.js adapter backed by Flashcore storage.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `FlashcoreAdapterOptions` | Requires a `secret` used for hashing tokens and verification records. |

## Returns

[`PasswordAdapter`](Interface.PasswordAdapter.md)

A password-aware Auth.js adapter instance.

## Example

```ts
const adapter = createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })
```
