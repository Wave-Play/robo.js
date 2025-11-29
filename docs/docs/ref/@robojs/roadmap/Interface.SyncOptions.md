# Interface: SyncOptions

Options for synchronizing roadmap data to Discord.

## Properties

### dryRun?

```ts
optional dryRun: boolean;
```

Optional flag to preview changes without applying them (defaults to false)

***

### guild

```ts
guild: Guild;
```

The Discord guild to sync

***

### onProgress()?

```ts
optional onProgress: (update) => void | Promise<void>;
```

Optional callback invoked during sync to report progress

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `update` | [`SyncProgressUpdate`](Interface.SyncProgressUpdate.md) |

#### Returns

`void` \| `Promise`\<`void`\>

***

### provider

```ts
provider: RoadmapProvider<ProviderConfig>;
```

The roadmap provider instance

***

### signal?

```ts
optional signal: AbortSignal;
```

Optional abort signal that allows callers to cancel an in-flight sync.

When triggered, the sync stops before processing the next card and throws
a `SyncCanceledError`, preserving progress up to that point.

***

### syncId?

```ts
optional syncId: string;
```

Optional sync identifier for traceability across logs/UI
