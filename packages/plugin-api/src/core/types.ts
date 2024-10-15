import type { RoboRequest } from './robo-request.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { BaseConfig } from 'robo.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'

export interface RoboReply {
	raw: ServerResponse
	hasSent: boolean
	code: (statusCode: number) => RoboReply
	header: (name: string, value: string) => RoboReply
	json: (data: unknown) => RoboReply
	send: (response: BodyInit | Response) => RoboReply
}

export type RouteHandler = (req: RoboRequest, res: RoboReply) => unknown | Promise<unknown>

export type WebSocketHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void

export interface Api {
	default: (request: RoboRequest, reply: RoboReply) => unknown | Promise<unknown>
}

export interface ApiEntry extends BaseConfig {
	subroutes?: Record<string, ApiEntry>
}
