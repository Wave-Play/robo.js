# Interface: CreateRoadmapForumsOptions

Options for creating roadmap category and forum channels.

## Properties

### columns

```ts
columns: RoadmapColumn[];
```

Array of columns from the provider to create forums for.
Each column will get its own dedicated forum channel.

***

### guild

```ts
guild: Guild;
```

The Discord guild where the category and forums will be created.
