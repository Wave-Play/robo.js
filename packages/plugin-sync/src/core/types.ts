export interface MessagePayload<T = unknown | undefined> {
	data: T
	key?: string[]
	type: 'get' | 'off' | 'on' | 'ping' | 'pong' | 'update'
}
