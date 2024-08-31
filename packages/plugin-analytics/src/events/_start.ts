import { logger } from 'robo.js'
import { BaseEngine, setAnalytics } from '../utils/analytics'
import { GoogleAnalytics } from '../utils/GoogleAnalytics'
import { ManyEngines } from '../utils/ManyEngines'
import { PlausibleAnalytics } from '../utils/PlausibleAnalytics'

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
	const PAnalytics = process.env.PLAUSIBLE_DOMAIN_NAME

	if (GAnalytics && PAnalytics) {
		setAnalytics(new ManyEngines(new GoogleAnalytics(), new PlausibleAnalytics()))
		return
	}

	if (GAnalytics) {
		setAnalytics(new GoogleAnalytics())
		return
	}

	if (PAnalytics) {
		setAnalytics(new PlausibleAnalytics())
		return
	}

	return logger.warn('No Analytics Engine, please provide one, see https://robojs.dev/plugins/analytics to learn how.')
}
