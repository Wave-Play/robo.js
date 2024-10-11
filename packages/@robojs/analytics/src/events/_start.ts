import { color, composeColors } from 'robo.js'
import { setAnalytics } from '../core/analytics.js'
import { BaseEngine } from '../engines/base.js'
import { analyticsLogger } from '../core/loggers.js'
import { GoogleAnalytics } from '../engines/google-analytics.js'
import { ManyEngines } from '../engines/many.js'
import { PlausibleAnalytics } from '../engines/plausible.js'

interface PluginOptions {
	engine?: BaseEngine
}
export let pluginOptions: PluginOptions = {}

export default (_client: unknown, options: PluginOptions) => {
	pluginOptions = options ?? {}

	if (pluginOptions.engine) {
		setAnalytics(pluginOptions.engine)
		return
	}

	const GAnalytics = process.env.GOOGLE_ANALYTICS_MEASURE_ID
	const PAnalytics = process.env.PLAUSIBLE_DOMAIN

	if (GAnalytics && PAnalytics) {
		setAnalytics(new ManyEngines(new GoogleAnalytics(), new PlausibleAnalytics()))
	} else if (GAnalytics) {
		setAnalytics(new GoogleAnalytics())
	} else if (PAnalytics) {
		setAnalytics(new PlausibleAnalytics())
	} else {
		analyticsLogger.warn(
			'Must have at least one analytics engine enabled. See',
			composeColors(color.bold, color.cyan)('https://robojs.dev/plugins/analytics.')
		)
	}
}
