# Interface: GuildSettings

Per-guild configuration envelope that customizes giveaway behaviour.

Settings are merged with DEFAULT_SETTINGS at runtime to ensure a
complete object is always available to commands and utilities.

## Properties

### defaults

```ts
defaults: object;
```

Default attributes applied to newly created giveaways.

| Name | Type | Description |
| ------ | ------ | ------ |
| `buttonLabel` | `string` | Custom label displayed on the entry button component. |
| `dmWinners` | `boolean` | Whether winners should receive direct messages when selected. |
| `duration` | `string` | Default ISO 8601 duration string (e.g. `1h`, `2d`). |
| `winners` | `number` | Default number of winners for `/giveaway start`. |

***

### limits

```ts
limits: object;
```

Safety limits enforced across all giveaways within a guild.

| Name | Type | Description |
| ------ | ------ | ------ |
| `maxDurationDays` | `number` | Maximum giveaway duration expressed in whole days. |
| `maxWinners` | `number` | Upper bound on the number of winners that can be configured. |

***

### restrictions

```ts
restrictions: object;
```

Guild-wide entry requirements enforced for every giveaway.

| Name | Type | Description |
| ------ | ------ | ------ |
| `allowRoleIds` | `string`[] | Role IDs that are explicitly allowed to enter; empty means all roles allowed. |
| `denyRoleIds` | `string`[] | Role IDs that are prevented from entering. |
| `minAccountAgeDays` | `null` \| `number` | Minimum required Discord account age in days, or null to disable. |
