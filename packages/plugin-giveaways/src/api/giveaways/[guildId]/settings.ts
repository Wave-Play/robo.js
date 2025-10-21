import { Flashcore } from 'robo.js'
import type { RoboRequest } from '@robojs/server'
import type { GuildSettings } from '../../../types/giveaway'
import { DEFAULT_SETTINGS } from '../../../types/giveaway'

const guildSettingsNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'settings'
]

export default async (request: RoboRequest) => {
  const { guildId } = request.params

  // Handle GET request - Fetch guild settings
  if (request.method === 'GET') {
    const settings =
      (await Flashcore.get<GuildSettings>('data', {
        namespace: guildSettingsNamespace(guildId)
      })) || DEFAULT_SETTINGS
    return settings
  }

  // Handle PATCH request - Update guild settings
  if (request.method === 'PATCH') {
    let parsedBody: unknown
    try {
      parsedBody = await request.json()
    } catch (error) {
      return { status: 400, error: 'Invalid JSON body' }
    }

    if (!parsedBody || typeof parsedBody !== 'object') {
      return {
        status: 400,
        error: 'Invalid settings structure. Must include defaults, limits, or restrictions'
      }
    }

    const newSettings = parsedBody as Partial<GuildSettings>
    const hasRecognizedKey = ['defaults', 'limits', 'restrictions'].some(key =>
      Object.prototype.hasOwnProperty.call(newSettings, key)
    )

    if (!hasRecognizedKey) {
      return {
        status: 400,
        error: 'Invalid settings structure. Must include defaults, limits, or restrictions'
      }
    }

    if (newSettings.defaults !== undefined) {
      if (!newSettings.defaults || typeof newSettings.defaults !== 'object') {
        return { status: 400, error: 'defaults must be an object' }
      }

      if (newSettings.defaults.winners !== undefined) {
        const { winners } = newSettings.defaults
        if (typeof winners !== 'number' || !Number.isInteger(winners) || winners < 1) {
          return { status: 400, error: 'defaults.winners must be at least 1' }
        }
      }

      if (newSettings.defaults.duration !== undefined) {
        const { duration } = newSettings.defaults
        const match = typeof duration === 'string' ? duration.match(/^(\d+)[mhd]$/) : null
        const durationValue = match ? parseInt(match[1], 10) : NaN
        if (!match || Number.isNaN(durationValue) || durationValue <= 0) {
          return {
            status: 400,
            error: 'defaults.duration must match format: 10m, 1h, 2d (value > 0)'
          }
        }
      }

      if (newSettings.defaults.buttonLabel !== undefined) {
        const { buttonLabel } = newSettings.defaults
        if (
          typeof buttonLabel !== 'string' ||
          buttonLabel.length === 0 ||
          buttonLabel.length > 80
        ) {
          return {
            status: 400,
            error: 'defaults.buttonLabel must be between 1 and 80 characters'
          }
        }
      }

      if (newSettings.defaults.dmWinners !== undefined) {
        const { dmWinners } = newSettings.defaults
        if (typeof dmWinners !== 'boolean') {
          return { status: 400, error: 'defaults.dmWinners must be a boolean' }
        }
      }
    }

    if (newSettings.limits !== undefined) {
      if (!newSettings.limits || typeof newSettings.limits !== 'object') {
        return { status: 400, error: 'limits must be an object' }
      }

      if (newSettings.limits.maxWinners !== undefined) {
        const { maxWinners } = newSettings.limits
        if (
          typeof maxWinners !== 'number' ||
          !Number.isInteger(maxWinners) ||
          maxWinners < 1 ||
          maxWinners > 100
        ) {
          return {
            status: 400,
            error: 'limits.maxWinners must be between 1 and 100'
          }
        }
      }

      if (newSettings.limits.maxDurationDays !== undefined) {
        const { maxDurationDays } = newSettings.limits
        if (
          typeof maxDurationDays !== 'number' ||
          !Number.isInteger(maxDurationDays) ||
          maxDurationDays <= 0 ||
          maxDurationDays > 365
        ) {
          return {
            status: 400,
            error: 'limits.maxDurationDays must be between 1 and 365'
          }
        }
      }
    }

    if (newSettings.restrictions !== undefined) {
      if (!newSettings.restrictions || typeof newSettings.restrictions !== 'object') {
        return { status: 400, error: 'restrictions must be an object' }
      }

      if (newSettings.restrictions.allowRoleIds !== undefined) {
        const { allowRoleIds } = newSettings.restrictions
        if (!Array.isArray(allowRoleIds)) {
          return { status: 400, error: 'restrictions.allowRoleIds must be an array' }
        }
      }

      if (newSettings.restrictions.denyRoleIds !== undefined) {
        const { denyRoleIds } = newSettings.restrictions
        if (!Array.isArray(denyRoleIds)) {
          return { status: 400, error: 'restrictions.denyRoleIds must be an array' }
        }
      }

      if (newSettings.restrictions.minAccountAgeDays !== undefined) {
        const { minAccountAgeDays } = newSettings.restrictions
        if (
          minAccountAgeDays !== null &&
          (typeof minAccountAgeDays !== 'number' || minAccountAgeDays < 0)
        ) {
          return {
            status: 400,
            error: 'restrictions.minAccountAgeDays must be null or a non-negative number'
          }
        }
      }
    }

    const currentSettings =
      (await Flashcore.get<GuildSettings>('data', {
        namespace: guildSettingsNamespace(guildId)
      })) || DEFAULT_SETTINGS

    const mergedSettings: GuildSettings = {
      defaults: { ...currentSettings.defaults, ...(newSettings.defaults ?? {}) },
      limits: { ...currentSettings.limits, ...(newSettings.limits ?? {}) },
      restrictions: { ...currentSettings.restrictions, ...(newSettings.restrictions ?? {}) }
    }

    if (mergedSettings.defaults.winners > mergedSettings.limits.maxWinners) {
      return { status: 400, error: 'defaults.winners cannot exceed limits.maxWinners' }
    }

    try {
      await Flashcore.set('data', mergedSettings, { namespace: guildSettingsNamespace(guildId) })
    } catch (error) {
      console.error('Failed to save giveaway settings', error)
      return {
        status: 500,
        error: 'Failed to save settings',
        details: error instanceof Error ? error.message : String(error)
      }
    }

    return { success: true, settings: mergedSettings }
  }

  // Unsupported HTTP method
  return { status: 405, error: 'Method not allowed' }
}
