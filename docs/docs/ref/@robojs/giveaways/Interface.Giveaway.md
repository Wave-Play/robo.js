# Interface: Giveaway

Flashcore-backed data model representing a single giveaway lifecycle.

Giveaway records are written when a giveaway is created, mutated as entries
are collected and winners announced, and stored in the `giveaways:data`
namespace for durability across restarts.

## Properties

### allowRoleIds

```ts
allowRoleIds: string[];
```

Whitelist of role IDs; empty array allows all roles to enter.

***

### channelId

```ts
channelId: string;
```

Discord channel ID where the giveaway message lives.

***

### createdAt

```ts
createdAt: number;
```

Epoch timestamp (ms) when the giveaway record was created.

***

### cronJobId?

```ts
optional cronJobId: null | string;
```

Optional cron job identifier when scheduled via @robojs/cron.

***

### denyRoleIds

```ts
denyRoleIds: string[];
```

Blacklist of role IDs prohibited from entering.

***

### endsAt

```ts
endsAt: number;
```

Epoch timestamp (ms) at which the giveaway should end.

***

### entries

```ts
entries: Record<string, number>;
```

Entrant weighting map keyed by Discord user ID.

***

### finalizedAt

```ts
finalizedAt: null | number;
```

Epoch timestamp (ms) when the giveaway ended or was cancelled.

***

### guildId

```ts
guildId: string;
```

Discord guild ID hosting the giveaway.

***

### id

```ts
id: string;
```

Unique giveaway identifier, currently a ULID string.

***

### messageId

```ts
messageId: string;
```

Discord message ID for the giveaway announcement.

***

### minAccountAgeDays

```ts
minAccountAgeDays: null | number;
```

Minimum required account age for entrants, or null to disable.

***

### prize

```ts
prize: string;
```

Prize description that appears in embeds and DMs.

***

### rerolls

```ts
rerolls: string[][];
```

Historical reroll batches, newest appended to the array.

***

### startedBy

```ts
startedBy: string;
```

Discord user ID of the moderator that started the giveaway.

***

### status

```ts
status: "active" | "ended" | "cancelled";
```

Current lifecycle state of the giveaway.

***

### winners

```ts
winners: string[];
```

User IDs selected as winners when the giveaway finalized.

***

### winnersCount

```ts
winnersCount: number;
```

Number of winners that should be selected when the giveaway ends.
