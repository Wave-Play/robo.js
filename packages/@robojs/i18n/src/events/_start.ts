import { i18nLogger } from '~/core/loggers.js'
import { loadLocales } from '~/core/utils.js'

export default () => {
	const time = loadLocales()
	i18nLogger.ready(`Locales loaded in ${time}ms`)
}
