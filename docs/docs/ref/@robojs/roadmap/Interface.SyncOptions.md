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

### provider

```ts
provider: RoadmapProvider<ProviderConfig>;
```

The roadmap provider instance
