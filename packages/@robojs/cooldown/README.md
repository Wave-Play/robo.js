# @robojs/cooldown

> Add cooldown functionality to your Robo.js Discord bot commands!

## Features

- 🕐 **Flexible Cooldowns**: Set custom cooldown durations per command
- 👥 **Multi-scope Support**: User-specific, channel-specific, or global cooldowns
- ⚡ **Easy Integration**: Simple middleware pattern
- 🔧 **Configurable**: Customize error messages and behavior
- 📊 **Cooldown Management**: Built-in commands and API endpoints

## Installation

```bash
npm install @robojs/cooldown
```

## Quick Start

### 1. Using Middleware (Recommended)

Apply cooldowns automatically to all commands:

```typescript
// src/middleware/cooldown.ts
import { withCooldown } from '@robojs/cooldown';

export default withCooldown({
  default: 5000, // 5 second default cooldown
  scopes: ['user', 'channel'], // User and channel specific
});
```

### 2. Per-Command Cooldown

Set cooldowns for specific commands:

```typescript
// src/commands/ping.ts
import { applyCooldown } from '@robojs/cooldown';

export const config = {
  cooldown: 10000, // 10 seconds
  cooldownScope: 'user'
};

export default async (interaction) => {
  const result = await applyCooldown(interaction, config);
  if (!result.allowed) {
    return interaction.reply(result.message);
  }
  
  return interaction.reply('Pong!');
};
```

## Configuration

### Cooldown Options

```typescript
interface CooldownConfig {
  default?: number;           // Default cooldown in milliseconds
  scopes?: CooldownScope[];  // ['user', 'channel', 'guild', 'global']
  message?: string;          // Custom cooldown message
  bypassRoles?: string[];    // Role IDs that bypass cooldowns
}
```

### Cooldown Scopes

- `user`: Per-user cooldown
- `channel`: Per-channel cooldown  
- `guild`: Per-guild cooldown
- `global`: Global cooldown across all uses

## Built-in Commands

The plugin includes management commands:

### `/cooldown check`
Check remaining cooldown for a command

### `/cooldown reset`
Reset cooldowns for a user (requires permissions)

### `/cooldown list`
List all active cooldowns

## API Endpoints

When used with `@robojs/server`:

### `GET /api/cooldown/status`
Get cooldown status for a user/command

### `POST /api/cooldown/reset`
Reset specific cooldowns

### `GET /api/cooldown/stats`
View cooldown statistics

## Advanced Usage

### Custom Error Messages

```typescript
export default withCooldown({
  default: 5000,
  message: 'Whoa there! Please wait {remaining} before using this again.'
});
```

### Bypass Roles

```typescript
export default withCooldown({
  default: 5000,
  bypassRoles: ['123456789', '987654321']
});
```

### Manual Cooldown Management

```typescript
import { getCooldown, setCooldown, resetCooldown } from '@robojs/cooldown';

// Get remaining cooldown
const remaining = await getCooldown(userId, commandName);

// Set custom cooldown
await setCooldown(userId, commandName, 10000);

// Reset cooldown
await resetCooldown(userId, commandName);
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © [WavePlay](https://waveplay.com)
