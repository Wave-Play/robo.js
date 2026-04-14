import { color, composeColors, Robo } from 'robo.js'
import { setAnalytics } from '../core/analytics.js'
import { BaseEngine } from '../engines/base.js'
import { analyticsLogger } from '../core/loggers.js'
import { GoogleAnalytics } from '../engines/google-analytics.js'
import { ManyEngines } from '../engines/many.js'
import { PlausibleAnalytics } from '../engines/plausible.js'
import type { StartContext } from 'robo.js'

interface PluginOptions {
	engine?: BaseEngine
}
export let pluginOptions: PluginOptions = {}

export default (_context: StartContext<PluginOptions>) => {
	pluginOptions = _context.pluginConfig ?? {}

	if (pluginOptions.engine) {
		setAnalytics(pluginOptions.engine)
		Robo.status.set('analytics', 'Analytics ready')
		return
	}

	const GAnalytics = process.env.GOOGLE_ANALYTICS_MEASURE_ID
	const PAnalytics = process.env.PLAUSIBLE_DOMAIN

	if (GAnalytics && PAnalytics) {
		setAnalytics(new ManyEngines(new GoogleAnalytics(), new PlausibleAnalytics()))
		Robo.status.set('analytics', 'Analytics ready')
	} else if (GAnalytics) {
		setAnalytics(new GoogleAnalytics())
		Robo.status.set('analytics', 'Analytics ready')
	} else if (PAnalytics) {
		setAnalytics(new PlausibleAnalytics())
		Robo.status.set('analytics', 'Analytics ready')
	} else {
		analyticsLogger.warn(
			'Must have at least one analytics engine enabled. See',
			composeColors(color.bold, color.cyan)('https://robojs.dev/plugins/analytics.')
		)
	}
}
