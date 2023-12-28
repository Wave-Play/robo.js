import { pluginOptions } from '~/events/_start.js'

export default async () => {
	const { engine } = pluginOptions

	if (engine.isRunning()) {
		await engine.stop()
	}
}
