import { pluginOptions } from '~/events/_start.js'

export default async () => {
	const { server } = pluginOptions
	if (server.isRunning()) {
		await server.stop()
	}
}
