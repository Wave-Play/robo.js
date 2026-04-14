import { Flashcore } from 'robo.js'
import { Robo } from 'robo.js'
import type { StartContext } from 'robo.js'
import { Project, Task } from '~/utils/models.js'
import { getTaskStats, hasTaskStats, STATS_KEY } from '~/utils/kv.js'
import { hasExtras } from '~/utils/extras.js'
import type { WatcherCallback } from 'robo.js/flashcore'

let statsWatcher: WatcherCallback | null = null

export default async function (context: StartContext) {
	const projects = await Project.findMany({ take: 1 })
	if (projects.length === 0) {
		await Project.create({ name: 'General', description: 'Default project' })
		context.logger.info('Seeded default "General" project')
	}

	// Initialize KV counters if not present
	if (!(await hasTaskStats())) {
		const total = await Task.count({})
		const open = await Task.count({ where: { status: 'open' } })
		const done = await Task.count({ where: { status: 'done' } })
		await Flashcore.set(STATS_KEY, { total, open, done })
		context.logger.debug('Initialized task stats counters')
	}

	// Register KV watcher for stats changes
	statsWatcher = (_old, newVal) => {
		const stats = newVal as { total?: number } | undefined
		if (stats?.total !== undefined) {
			Robo.status.set('tasks', `${stats.total} tasks tracked`, { priority: 8 })
		}
	}
	Flashcore.on(STATS_KEY, statsWatcher)

	// Update status with current count
	const stats = await getTaskStats()
	Robo.status.set('tasks', `${stats.total} tasks tracked`, { priority: 8 })

	// System API check
	if (Flashcore.$.isInitialized) {
		context.logger.debug('Flashcore system initialized')
	}

	// Extras detection — validate schemas if available
	if (hasExtras()) {
		try {
			const result = await Flashcore.$.validateSchemas()
			if (result && result.changedModels.length > 0) {
				context.logger.warn('Schema changes detected — run /db info for details')
			}
		} catch {
			// flashcore-extras not fully loaded yet, skip
		}
	}

	Robo.status.flash('Taskmaster ready!')
}

export { statsWatcher }
