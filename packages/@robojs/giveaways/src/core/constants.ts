/**
 * Maximum number of recent giveaway IDs to keep in the guild's recent list.
 * Used in giveaway-utils.ts to limit the size of the recent giveaways array.
 */
export const RECENT_GIVEAWAYS_LIMIT = 50

/**
 * Cooldown duration in milliseconds for Enter/Leave button interactions.
 * Prevents spam clicking on giveaway entry buttons (3 seconds).
 * Used in interactionCreate.ts for both handleEnter() and handleLeave() functions.
 */
export const BUTTON_COOLDOWN_MS = 3000

/**
 * Maximum setTimeout value in milliseconds (~24.8 days).
 * JavaScript's setTimeout has a maximum delay of 2^31-1 milliseconds.
 * Used in scheduler.ts to chunk long-duration giveaway schedules.
 */
export const MAX_TIMEOUT_MS = 2147483647
