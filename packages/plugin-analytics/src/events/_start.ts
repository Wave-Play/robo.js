import { BaseEngine, setAnalytics } from '../core/analytics.js'
import { GoogleAnalytics } from '../engines/GoogleAnalytics.js'
import { ManyEngines } from '../engines/ManyEngines.js'
import { PlausibleAnalytics } from '../engines/PlausibleAnalytics.js'

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
	} else if (GAnalytics) {
		setAnalytics(new GoogleAnalytics())
	} else if (PAnalytics) {
		setAnalytics(new PlausibleAnalytics())
	} else {
		throw new Error('No Analytics Engine, please provide one, see https://robojs.dev/plugins/analytics to learn how.')
	}
}
