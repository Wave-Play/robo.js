import { color, Flashcore } from 'robo.js'
import { Cron } from '../core/cron.js'
import { cronLogger } from '../core/loggers.js'

export default async () => {
	const jobIndex = (await Flashcore.get<string[]>('jobs', { namespace: '__plugin_cron_' })) || []
	cronLogger.debug(`Restoring ${jobIndex.length} cron jobs...`)

	for (const jobId of jobIndex) {
		const jobData = await Flashcore.get<{ cron: string; path: string }>(jobId, { namespace: '__plugin_cron_' })

		if (jobData) {
			const { cron, path } = jobData
			try {
				Cron(cron, path)
				cronLogger.debug(`Restored cron job: ${color.bold(jobId)} (${cron}) - ${path}`)
			} catch (error) {
				cronLogger.error(`Failed to restore cron job ${color.bold(jobId)}:`, error)
				await Cron.remove(jobId)
			}
		} else {
			cronLogger.warn(`Job data not found for ID ${color.bold(jobId)}`)
			await Cron.remove(jobId)
		}
	}
}
