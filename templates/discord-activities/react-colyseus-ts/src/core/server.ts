import { GameName } from './constants.js'
import { StateHandlerRoom } from '../rooms/StateHandlerRoom.js'
import http from 'node:http'
import { Server as ColyseusServer } from '@colyseus/core'
import { MonitorOptions, monitor } from '@colyseus/monitor'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { NodeEngine } from '@robojs/server/engines.js'
import express from 'express'
import { logger as defaultLogger } from 'robo.js'
import type { InitOptions, StartOptions } from '@robojs/server/engines.js'
import type { ViteDevServer } from 'vite'

const logger = defaultLogger.fork('server')

export class ColyseusServerEngine extends NodeEngine {
	private _colyseusServer: ColyseusServer | null = null
	private _colyseusHttpServer: http.Server | null = null

	/**
	 * Define your Colyseus server here.
	 */
	public async init(options: InitOptions): Promise<void> {
		await super.init(options)
		this._init()

		// filterBy allows us to call joinOrCreate and then hold one game per channel
		// https://discuss.colyseus.io/topic/345/is-it-possible-to-run-joinorcreatebyid/3
		this._colyseusServer!.define(GameName, StateHandlerRoom).filterBy(['channelId'])
	}

	public setupVite(vite: ViteDevServer) {
		super.setupVite(vite)
		this._patchServerHandler()
	}

	/**
	 * Use a different port for Colyseus to avoid Vite HMR conflicts
	 */
	public async start(options: StartOptions): Promise<void> {
		await super.start(options)
		this._colyseusHttpServer!.listen(options.port + 1)
	}

	public async stop(): Promise<void> {
		await super.stop()
		await this._colyseusServer?.gracefullyShutdown()
	}

	/**
	 * Initialize the Colyseus server
	 * A dedicated HTTP server is used to avoid conflicts with Vite HMR
	 */
	private _init() {
		this._patchServerHandler()

		const expressApp = express()
		this._colyseusHttpServer = http.createServer(expressApp)
		this._colyseusServer = new ColyseusServer({
			logger: defaultLogger.fork('colyseus'),
			transport: new WebSocketTransport({
				server: this._colyseusHttpServer!
			})
		})

		const colyseusMonitor = monitor(this._colyseusHttpServer as Partial<MonitorOptions>)
		expressApp.use('/colyseus', colyseusMonitor)
		this.registerWebsocket('default', (req, socket, head) => {
			this._colyseusHttpServer!.emit('upgrade', req, socket, head)
		})
	}

	/**
	 * Patch the server handler to forward /colyseus** requests
	 */
	private _patchServerHandler() {
		const oldHandler = this._serverHandler
		this._serverHandler = (req, res) => {
			if (req.url?.startsWith('/colyseus')) {
				logger.debug('Forwarding to Colyseus:', req.url)
				this._colyseusHttpServer!.emit('request', req, res)
				return
			}

			oldHandler?.(req, res)
		}
	}
}
