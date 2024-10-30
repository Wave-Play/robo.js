import { cronLogger } from './loggers.js'
import { IS_BUN } from './utils.js'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Cron as CronerJob } from 'croner'
import { color, Flashcore } from 'robo.js'
import { v4 as uuidv4 } from 'uuid'

class CronJob {
	private cronJob: CronerJob
	private id: string
	private path?: string
	private expression: string

	constructor(cronExpression: string, jobFunction: string | (() => void)) {
		this.id = uuidv4()
		this.expression = cronExpression

		if (typeof jobFunction === 'string') {
			this.path = jobFunction
			this.cronJob = new CronerJob(cronExpression, () => {
				this.executeFileBasedJob(jobFunction)
			})
		} else {
			this.cronJob = new CronerJob(cronExpression, jobFunction)
		}
	}

	private executeFileBasedJob(jobPath: string): void {
		try {
			let absolutePath = path.resolve(path.join(process.cwd(), '.robo', 'build', jobPath))
			cronLogger.debug(`Executing cron job handler: ${color.bold(jobPath)}`)

			if (!fs.existsSync(absolutePath) && absolutePath.endsWith('.js') && IS_BUN) {
				absolutePath = absolutePath.replace(/\.js$/, '.ts')
			}

			if (fs.existsSync(absolutePath)) {
				const fileUrl = pathToFileURL(absolutePath).href
				import(fileUrl).then((module) => {
					if (typeof module.default === 'function') {
						module.default()
					} else {
						throw new Error(`Missing default export for job: ${color.bold(jobPath)}`)
					}
				})
			} else {
				cronLogger.error(`File ${color.bold(jobPath)} does not exist.`)
			}
		} catch (error) {
			cronLogger.error(error)
		}
	}

	async save(id?: string): Promise<string> {
		if (!this.path) {
			throw new Error('Only file-based cron jobs can be persisted.')
		}

		const jobId = id || this.id

		await Flashcore.set(
			jobId,
			{ cron: this.expression, path: this.path },
			{
				namespace: '__plugin_cron_'
			}
		)

		await Flashcore.set(
			'jobs',
			(jobs: string[] = []) => {
				if (!jobs.includes(jobId)) {
					jobs.push(jobId)
				}
				return jobs
			},
			{ namespace: '__plugin_cron_' }
		)

		return jobId
	}

	pause(): void {
		this.cronJob.pause()
	}

	resume(): void {
		this.cronJob.resume()
	}

	stop(): void {
		this.cronJob.stop()
	}

	nextRun(): Date | null {
		return this.cronJob.nextRun()
	}
}

export function Cron(cronExpression: string, jobFunction: string | (() => void)): CronJob {
	return new CronJob(cronExpression, jobFunction)
}

Cron.remove = async (id: string): Promise<void> => {
	await Flashcore.delete(id, { namespace: '__plugin_cron_' })
	await Flashcore.set('jobs', (jobs: string[] = []) => jobs.filter((jobId) => jobId !== id), {
		namespace: '__plugin_cron_'
	})
}
