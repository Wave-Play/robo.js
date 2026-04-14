import { Robo } from 'robo.js'
import { loadLocales } from '~/core/utils.js'

export default () => {
	const time = loadLocales()
	Robo.status.set('i18n', `Locales loaded in ${time}ms`)
}
