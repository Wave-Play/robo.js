# Function: isProviderReady()

```ts
function isProviderReady(): boolean
```

Check if the provider is initialized and ready to use

## Returns

`boolean`

true if provider is initialized, false otherwise

## Example

```ts
import { isProviderReady } from '@robojs/roadmap'

if (!isProviderReady()) {
  console.error('Provider not configured')
  return
}
```
