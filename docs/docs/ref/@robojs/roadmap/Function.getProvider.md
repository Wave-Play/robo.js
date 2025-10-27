# Function: getProvider()

```ts
function getProvider(): RoadmapProvider | null
```

Get the initialized provider instance

## Returns

[`RoadmapProvider`](Class.RoadmapProvider.md) \| `null`

The initialized provider, or null if not initialized

## Example

```ts
import { getProvider, isProviderReady } from '@robojs/roadmap'

if (isProviderReady()) {
  const provider = getProvider()
  const cards = await provider.fetchCards()
}
```
