import { color, Flashcore, setState } from 'robo.js'
import { Cron } from '../core/cron.js'
import { cronLogger } from '../core/loggers.js'

const NAMESPACE = '__plugin_cron_'

export default async () => {
	const jobIndex = (await Flashcore.get<string[]>('jobs', { namespace: NAMESPACE })) || []
	cronLogger.debug(`Restoring ${jobIndex.length} cron jobs...`)

	for (const jobId of jobIndex) {
		const jobData = await Flashcore.get<{ cron: string; path: string }>(jobId, { namespace: NAMESPACE })

		if (jobData) {
			const { cron, path } = jobData
			try {
				const job = Cron(cron, path)
				setState(`${NAMESPACE}${jobId}`, job)
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
