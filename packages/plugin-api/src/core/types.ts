import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { BaseConfig } from 'robo.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'

export interface RoboRequest<T = Record<string, unknown>> {
	req: IncomingMessage
	body: T
	method: HttpMethod
	query: Record<string, string | string[]>
	params: Record<string, unknown>
}

export interface RoboReply {
	res: ServerResponse
	code: (statusCode: number) => RoboReply
	json: (data: unknown) => RoboReply
	send: (data: string) => RoboReply
	header: (name: string, value: string) => RoboReply
	hasSent: boolean
}

export type RouteHandler = (req: RoboRequest, res: RoboReply) => unknown | Promise<unknown>

export type WebSocketHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void

export interface Api {
	default: (request: RoboRequest, reply: RoboReply) => unknown | Promise<unknown>
}

export interface ApiEntry extends BaseConfig {
	subroutes?: Record<string, ApiEntry>
}
