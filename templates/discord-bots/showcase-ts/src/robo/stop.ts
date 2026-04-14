import { Flashcore } from 'robo.js'
import { Robo } from 'robo.js'
import type { StopContext } from 'robo.js'
import { STATS_KEY } from '~/utils/kv.js'
import { statsWatcher } from './start.js'

export default function (context: StopContext) {
	context.logger.info(`Shutting down (reason: ${context.reason})`)

	// Cleanup KV watcher
	if (statsWatcher) {
		Flashcore.off(STATS_KEY, statsWatcher)
	}

	Robo.status.remove('tasks')
}
