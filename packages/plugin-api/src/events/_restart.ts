import Server from '../core/server.js'

export default async () => {
	if (Server.isRunning()) {
		await Server.stop()
	}
}
