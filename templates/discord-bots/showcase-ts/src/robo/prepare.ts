import type { PrepareContext } from 'robo.js'
import { registerModels } from '~/utils/models.js'

export default async function (context: PrepareContext) {
	context.logger.debug('Registering Flashcore models...')
	registerModels()
}
