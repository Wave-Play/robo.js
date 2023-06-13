import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BaseConfig } from '.'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'

export interface RoboRequest {
	req: IncomingMessage
	body?: unknown
	method: HttpMethod
	query: Record<string, unknown>
	params: Record<string, unknown>
}

export interface RoboReply {
	res: ServerResponse
	code: (statusCode: number) => RoboReply
	send: (data: string) => RoboReply
	header: (name: string, value: string) => RoboReply
	hasSent: boolean
}

export type RouteHandler = (req: RoboRequest, res: RoboReply) => unknown | Promise<unknown>

export interface Api {
	default: (request: RoboRequest, reply: RoboReply) => unknown | Promise<unknown>
}

export interface ApiEntry extends BaseConfig {
	subroutes?: Record<string, ApiEntry>
}
