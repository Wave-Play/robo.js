import { NodeEngine } from '@robojs/server/engines.js'
import type { InitOptions } from '@robojs/server/engines.js'

type NextApp = ReturnType<typeof import('next')['default']>

export class NextServerEngine extends NodeEngine {
	private app: NextApp | null = null
	private handle: ReturnType<NextApp['getRequestHandler']> | null = null

	public async init(options: InitOptions) {
		await super.init(options)

			const { default: next } = await import('next')
			this.app = next({ dev: process.env.NODE_ENV !== 'production' })
			await this.app.prepare()
			this.handle = this.app.getRequestHandler()

			this.registerNotFound(async (req, res) => {
				return this.handle!(req.raw, res.raw)
			})

			const upgrade = this.app.getUpgradeHandler()
			this.registerWebsocket('/_next/webpack-hmr', (req, socket, head) => {
				upgrade(req, socket, head)
			})
			this.registerWebsocket('/ws', (req, socket, head) => {
				upgrade(req, socket, head)
			})
	}

	public async stop() {
		await super.stop()
		if (this.app) {
			await this.app.close()
			this.app = null
			this.handle = null
		}
	}
}
