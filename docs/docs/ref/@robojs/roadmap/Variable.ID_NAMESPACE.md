# Variable: ID\_NAMESPACE

```ts
const ID_NAMESPACE: "@robojs/roadmap:" = '@robojs/roadmap:';
```

Namespace prefix for all component IDs and settings storage.

This constant is used in two ways:
1. As a prefix for Discord component custom IDs to avoid collisions
2. As part of the Flashcore settings namespace: `@robojs/roadmap:{guildId}`

## Example

```ts
// Component ID usage
const buttonId = ID_NAMESPACE + 'button-toggle-public';

// Settings namespace usage
const namespace = ID_NAMESPACE + guildId;
const settings = getState('settings', { namespace });
```
