# Interface: SpiritMessage

## Properties

| Property | Type |
| ------ | ------ |
| `error?` | `unknown` |
| `event?` | \| `"ready"` \| `"command"` \| `"restart"` \| `"build"` \| `"get-state"` \| `"set-state"` \| `"start"` \| `"stop"` |
| `payload?` | `unknown` |
| `state?` | `Record`\<`string`, `unknown`\> |
| `verbose?` | `boolean` |
