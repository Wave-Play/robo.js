import { Flashcore } from 'robo.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { giveawaysLogger } from '../core/logger.js'
import type { Giveaway } from '../types/giveaway.js'
import { MAX_TIMEOUT_MS } from '../core/constants.js'

// Runtime detection for @robojs/cron
type CronStatic = {
  (expression: string, job: string | (() => void)): { save(id?: string): Promise<string> }
  get(id: string): unknown
  remove(id: string): Promise<void>
}

let Cron: CronStatic | null = null
let cronAvailable = false
let cronInitPromise: Promise<void> | null = null

/**
 * Detect the optional `@robojs/cron` runtime and cache scheduling hooks.
 *
 * The detection promise is memoized so the function can be called multiple
 * times safely (the first invocation performs the dynamic import). When cron
 * is unavailable the plugin transparently falls back to `setTimeout`
 * scheduling.
 *
 * @returns Promise that resolves once cron availability has been determined.
 * @example
 * await initCron()
 */
export async function initCron(): Promise<void> {
  if (cronInitPromise) return cronInitPromise

  cronInitPromise = (async () => {
    try {
      const cronModule = await import('@robojs/cron')
      Cron = cronModule.Cron
      cronAvailable = true
      giveawaysLogger.debug('✅ @robojs/cron detected - using persistent scheduling')
    } catch {
      giveawaysLogger.debug('ℹ️  @robojs/cron not available - using setTimeout fallback')
    }
  })()

  return cronInitPromise
}

/**
 * Convert a millisecond timestamp into a one-shot cron expression.
 *
 * Generates the `second minute hour day month *` format expected by the
 * `@robojs/cron` scheduler so the giveaway can be executed at a precise
 * instant.
 *
 * @param timestamp - Epoch timestamp in milliseconds.
 * @returns Cron expression string representing the scheduled moment.
 */
function timestampToCronExpression(timestamp: number): string {
  const date = new Date(timestamp)
  const seconds = date.getSeconds()
  const minutes = date.getMinutes()
  const hours = date.getHours()
  const dayOfMonth = date.getDate()
  const month = date.getMonth() + 1

  return `${seconds} ${minutes} ${hours} ${dayOfMonth} ${month} *`
}

/**
 * Schedule the automatic completion of a giveaway at its configured end time.
 *
 * When `@robojs/cron` is available the giveaway is persisted as a cron
 * job that survives restarts; otherwise the function creates a cascading
 * `setTimeout` chain that reschedules for long-running giveaways. Expired
 * giveaways are processed immediately.
 *
 * @param giveaway - Giveaway instance that should be finalized at `endsAt`.
 * @returns Promise that resolves to the cron job ID string when cron is used,
 * or `null` when the setTimeout path is chosen.
 * @throws {Error} Propagates errors from the fallback scheduler if they occur;
 * cron-specific failures are logged and the function gracefully falls back to
 * `setTimeout` instead.
 * @example
 * const jobId = await scheduleGiveawayEnd(giveaway)
 * if (jobId) await Flashcore.set('job', jobId, { namespace: ['giveaways'] })
 */
export async function scheduleGiveawayEnd(giveaway: Giveaway): Promise<string | null> {
  // Ensure cron is initialized
  await initCron()

  const delay = giveaway.endsAt - Date.now()

  if (delay <= 0) {
    // Already expired, end immediately
    await endGiveawayImmediately(giveaway.id)
    return null
  }

  // Use @robojs/cron if available
  if (cronAvailable && Cron) {
    try {
      const jobId = `giveaway:${giveaway.id}`

      // Convert endsAt timestamp to cron expression for one-time execution
      const cronExpression = timestampToCronExpression(giveaway.endsAt)

      // Create file-based job for persistence
      // Resolve the plugin's compiled cron handler to an absolute path so
      // @robojs/cron can import it directly without relying on the consumer
      // project to copy the file into its own .robo/build tree.
      const here = path.dirname(fileURLToPath(import.meta.url))
      const cronJobPath = path.resolve(here, '../cron/end-giveaway.js')
      const job = Cron(cronExpression, cronJobPath)

      // Save mapping from jobId to giveawayId for the cron job to use
      await Flashcore.set(jobId, giveaway.id, { namespace: ['giveaways', 'cron'] })

      // Persist the job
      await job.save(jobId)

      const timeUntilEnd = Math.round(delay / 1000)
      giveawaysLogger.debug(
        `⏰ Scheduled giveaway ${giveaway.id} via cron to end in ${timeUntilEnd}s (jobId: ${jobId})`
      )

      return jobId
    } catch (error) {
      giveawaysLogger.error(`Failed to schedule with cron, falling back to setTimeout:`, error)
      // Fall through to setTimeout logic
    }
  }

  // Fallback: setTimeout has a max value of ~24.8 days
  // For longer durations, we'll reschedule periodically
  // The constant is defined in constants.ts for reusability
  const MAX_TIMEOUT = MAX_TIMEOUT_MS
  const actualDelay = Math.min(delay, MAX_TIMEOUT)

  setTimeout(async () => {
    // Check if giveaway should end now or needs rescheduling
    const remainingTime = giveaway.endsAt - Date.now()

    if (remainingTime <= 0) {
      // Time's up - end the giveaway
      const { endGiveaway } = await import('./giveaway-utils.js')
      await endGiveaway(giveaway.id)
    } else {
      // Still time left - reschedule
      giveawaysLogger.debug(
        `⏱️  Rescheduling giveaway ${giveaway.id} (${Math.round(remainingTime / 1000)}s remaining)`
      )
      await scheduleGiveawayEnd(giveaway)
    }
  }, actualDelay)

  const timeUntilEnd = Math.round(delay / 1000)
  giveawaysLogger.debug(
    `⏰ Scheduled giveaway ${giveaway.id} via setTimeout to end in ${timeUntilEnd}s`
  )

  return null
}

/**
 * Immediately finalize a giveaway that has already crossed its end timestamp.
 *
 * Internally imports {@link endGiveaway} to avoid circular dependencies at
 * module load, ensuring the scheduler can operate independently.
 *
 * @param giveawayId - Identifier of the expired giveaway to close out.
 * @returns Promise that resolves once {@link endGiveaway} completes.
 */
async function endGiveawayImmediately(giveawayId: string): Promise<void> {
  giveawaysLogger.debug(`⚡ Ending expired giveaway ${giveawayId} immediately`)
  const { endGiveaway } = await import('./giveaway-utils.js')
  await endGiveaway(giveawayId)
}

/**
 * Cancel a previously scheduled giveaway completion job.
 *
 * The function removes stored cron jobs (and associated mappings) when cron is
 * active, or performs best-effort cleanup in setTimeout mode. Calls are safe to
 * repeat even if the job has already been cleared.
 *
 * @param giveawayId - Giveaway identifier used for logging context.
 * @param cronJobId - Persisted cron job ID to remove, or `null`/`undefined`
 * when using the setTimeout fallback.
 * @returns Promise that resolves once cleanup attempts have finished.
 * @example
 * await cancelScheduledJob(giveaway.id, giveaway.cronJobId)
 */
export async function cancelScheduledJob(
  giveawayId: string,
  cronJobId?: string | null
): Promise<void> {
  // Ensure cron is initialized
  await initCron()

  if (cronJobId && cronAvailable && Cron) {
    try {
      await Cron.remove(cronJobId)
      // Also remove the mapping
      await Flashcore.delete(cronJobId, { namespace: ['giveaways', 'cron'] })
      giveawaysLogger.debug(`🗑️  Removed cron job ${cronJobId} for giveaway ${giveawayId}`)
    } catch (error) {
      giveawaysLogger.error(`Failed to remove cron job ${cronJobId}:`, error)
    }
  } else {
    // setTimeout cleanup is best-effort since we don't store timer IDs
    giveawaysLogger.debug(`ℹ️  Giveaway ${giveawayId} was using setTimeout (no cleanup needed)`)
  }
}
