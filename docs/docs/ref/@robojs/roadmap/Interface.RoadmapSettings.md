# Interface: RoadmapSettings

Guild-specific roadmap configuration settings.

All properties are optional to support incremental updates and default values.
The plugin uses a category-based multi-forum structure where each column
(Backlog, In Progress, Done) gets its own dedicated forum channel.

## Properties

### authorizedCreatorRoles?

```ts
optional authorizedCreatorRoles: string[];
```

Array of Discord role IDs that are authorized to create roadmap cards.

Users with any of these roles (in addition to administrators) can create
new cards using the `/roadmap add` command or via the API. If empty or
undefined, only administrators can create cards.

#### Example

```ts
["1234567890123456789", "9876543210987654321"]
```

***

### categoryId?

```ts
optional categoryId: string;
```

The Discord category ID containing all roadmap forum channels.

This category organizes all column-specific forum channels in one place
and allows for unified permission management across all roadmap forums.

***

### forumChannels?

```ts
optional forumChannels: Record<string, string>;
```

Map of column names to Discord forum channel IDs.

Each column (e.g., 'Backlog', 'In Progress', 'Done') has its own
dedicated forum channel where cards in that column are posted.

#### Example

```ts
{
  "Backlog": "1234567890123456789",
  "In Progress": "9876543210987654321",
  "Done": "1111222233334444555"
}
```

***

### isPublic?

```ts
optional isPublic: boolean;
```

Whether the roadmap forums are publicly accessible or private.

This setting applies to all forum channels within the roadmap category.
- `true`: Everyone can view and comment on existing threads, but only admins/mods can create new threads
- `false`: Only administrators and moderators can view the forums
- `undefined`: Defaults to false (private)

***

### lastSyncTimestamp?

```ts
optional lastSyncTimestamp: number;
```

Unix timestamp in milliseconds of the last successful sync operation.

This timestamp is used to determine when the next sync should occur
and for displaying "last synced" information to users.

***

### syncedPosts?

```ts
optional syncedPosts: Record<string, string>;
```

Map of provider card IDs to Discord thread IDs.

This mapping tracks which external cards (e.g., Jira issues) have been
synced to which Discord forum posts, enabling updates instead of duplicates.
Threads can be in any of the column-specific forum channels.

#### Example

```ts
{
  "PROJ-123": "1234567890123456789",
  "PROJ-456": "9876543210987654321"
}
```
