export { withCooldown } from './middleware/index.js';
export { applyCooldown, getCooldown, setCooldown, resetCooldown, clearAllCooldowns } from './lib/cooldown-manager.js';
export type { CooldownConfig, CooldownScope, CooldownResult } from './lib/types.js';
