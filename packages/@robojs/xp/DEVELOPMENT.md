# 🛠️ Developing @robojs/xp

Welcome, fellow plugin developer! This guide will help you develop, build, and publish your **[Robo.js plugin](https://github.com/Wave-Play/robo/blob/main/docs/advanced/plugins.md)** as an NPM package. The plugin development process is almost identical to creating a regular Robo project, with the added benefit that commands and events will be automatically linked to the robos that install your plugin.

## Developing 🏗️

Create new slash commands by making a new file under the `/src/commands` directory with an exported default function. The file's name becomes the command's name. You can either use the `interaction` parameter or return the result to let Sage handle it for you. For more info on commands, see the [Discord.js documentation](https://discord.js.org/#/docs/main/stable/general/welcome).

To listen to new events, create a file named after the event in `/src/events`. For example, `typingStart.js` will notify you when someone starts typing. You can stack multiple files for the same event by making a directory named after the event. Files inside it can be named whatever you want. For example:

```
- src
  - events
    - typingStart
      - your-file.js
      - another.js
```

## Testing Your Plugin 🧪

To test your plugin during development, you can `robo add` it from your local directory in a test robo project. First, navigate to your test robo project's directory and run the following command:

```bash
npx robo add /path/to/@robojs/xp
```

Replace `/path/to/@robojs/xp` with the actual path to your plugin's directory. Remember to build your plugin between changes using the `robo build` command.

You can use `robo dev` to automatically rebuild your plugin when changes are detected. This is the recommended way to develop your plugin, as it provides a smoother development experience. If your test robo is also running in dev mode, it will auto-reload when your plugin is rebuilt.

```bash
npx robo dev
```

## Building the Plugin 🔨

Robo comes with a built-in compiler to help you package your plugin for distribution. To build your plugin, run the following command:

```bash
npx robo build plugin
```

This will compile your plugin and prepare it for publishing to NPM.

## Publishing to NPM 📦

Once you've built your plugin using the `npx robo build` command, you're ready to publish it to NPM. Make sure you've set up your NPM account and are logged in through the CLI.

Run the following command to publish your plugin:

```bash
npm publish
```

Congratulations! Your plugin is now available on NPM for other Robo.js users to install and enjoy.

Remember to keep sensitive information out of your plugin. Avoid including any `.env` files or similar data that should not be shared with other users.

Happy plugin development! 🎉

## Schema Migrations 🔄

The `@robojs/xp` plugin includes a schema migration system to handle data structure changes across versions. This section explains how to add new migrations when modifying the data model.

### When to Add a Migration

Add a migration when you:
- Change the structure of `UserXP` interface (add/remove/rename fields)
- Change the structure of `GuildConfig` interface
- Modify how data is stored in Flashcore (namespace changes, key format changes)
- Add new required fields that existing data doesn't have

### Migration Process

**1. Increment Schema Version**

In `src/store/index.ts`, increment the `SCHEMA_VERSION` constant:

```typescript
// Before
export const SCHEMA_VERSION = 1

// After
export const SCHEMA_VERSION = 2
```

**2. Create Migration Function**

In `src/store/migrations.ts`, add a new migration function:

```typescript
/**
 * Migrates guild data from v1 to v2
 * Example: Add new 'streak' field to UserXP records
 */
async function migrateV1ToV2(guildId: string, options?: FlashcoreOptions): Promise<void> {
  const storeId = resolveStoreId(options)
  logger.info(\`Migrating guild \${guildId} store \${storeId} from v1 to v2\`)

  try {
    // Get all tracked users
    const members = await getMembers(guildId, options)

    // Update each user record
    for (const userId of members) {
      const user = await getUser(guildId, userId, options)
      if (user) {
        // Add new field with default value
        const updated = { ...user, streak: 0 }
        await putUser(guildId, userId, updated, options)
      }
    }

    logger.info(\`Successfully migrated \${members.size} users for guild \${guildId} store \${storeId}\`)
  } catch (error) {
    logger.error(\`Migration v1→v2 failed for guild \${guildId} store \${storeId}:\`, error)
    throw error
  }
}
```

**3. Register Migration**

Add the migration to the registry:

```typescript
// In src/store/migrations.ts
migrations.set(2, migrateV1ToV2)
```

**4. Update Type Definitions**

Update the `UserXP` or `GuildConfig` interface in `src/types.ts`:

```typescript
export interface UserXP {
  xp: number
  level: number
  lastAwardedAt: number
  messages: number
  xpMessages: number
  streak: number // New field added in v2
}
```

**5. Add Tests**

Add migration tests in `__tests__/store.test.ts`:

```typescript
test('Migration: v1 to v2 adds streak field', async () => {
  setupMockFlashcore()
  const guildId = '111111111111111111'
  const userId = '222222222222222222'

  // Create v1 user (without streak)
  await putUser(guildId, userId, { xp: 100, level: 1, lastAwardedAt: 0, messages: 10, xpMessages: 5 })
  await setSchemaVersion(guildId, 1)

  // Trigger migration by accessing user
  const user = await getUser(guildId, userId)

  // Verify migration ran
  expect(user).toHaveProperty('streak')
  expect(user.streak).toBe(0)
  expect(await getSchemaVersion(guildId)).toBe(2)

  restoreMockFlashcore()
})
```

### Migration Best Practices

**Idempotency**
- Migrations should be safe to run multiple times
- Check if data already has new fields before adding them
- Use conditional logic: `if (!user.newField) { user.newField = defaultValue }`

**Error Handling**
- Wrap Flashcore operations in try-catch blocks
- Log errors with context (guildId, storeId, userId)
- Re-throw errors to prevent partial migrations
- Schema version only updates on successful completion

**Performance**
- For large guilds (10k+ users), use rate limiting:
  ```typescript
  import pLimit from 'p-limit'
  const limit = pLimit(100)

  const promises = Array.from(members).map(userId =>
    limit(() => migrateUser(guildId, userId, options))
  )
  await Promise.all(promises)
  ```

**Multi-Store Support**
- Migrations run independently per store
- Always use `resolveStoreId(options)` to get the correct store
- Don't assume data exists in other stores

**Backward Compatibility**
- Support skipping versions (e.g., v1→v3 should work)
- The migration runner executes all intermediate migrations sequentially
- Test upgrade paths from all previous versions

### Testing Migrations Locally

**1. Create Test Data**

In your test robo project, create users with the old schema:

```typescript
// In a test command or script
import { Flashcore } from 'robo.js'

// Manually create v1 user data
await Flashcore.set('userId', {
  xp: 500,
  level: 3,
  lastAwardedAt: Date.now(),
  messages: 100,
  xpMessages: 50
  // No 'streak' field (v1 schema)
}, { namespace: ['xp', 'default', 'guildId', 'users'] })

// Set schema version to 1
await Flashcore.set('schema', 1, { namespace: ['xp', 'default', 'guildId'] })
```

**2. Trigger Migration**

Access the user data through the plugin API:

```typescript
import { xp } from '@robojs/xp'

// This will trigger migration automatically
const user = await xp.getUser('guildId', 'userId')
console.log(user) // Should have 'streak' field now
```

**3. Verify Results**

Check that:
- User data has new fields with correct default values
- Schema version updated to current version
- No errors in logs
- Subsequent calls don't re-run migration

### Troubleshooting

**Migration Not Running**
- Check that `SCHEMA_VERSION` was incremented
- Verify migration is registered in `migrations` Map
- Check logs for migration trigger messages

**Partial Migration Failure**
- Schema version is NOT updated on failure (safe to retry)
- Check Flashcore logs for specific errors
- Verify Flashcore permissions and rate limits

**Performance Issues**
- Add rate limiting for large guilds (see `getAllUsers()` implementation)
- Consider batching updates (100-1000 users per batch)
- Log progress for long-running migrations

### Documentation Updates

When adding migrations, update:
- `AGENTS.md` - Add migration details to section 14
- `DEVELOPMENT.md` - This section (add new migration examples)
- `README.md` - Mention breaking changes in changelog
- Type definitions - Update JSDoc comments for modified interfaces
