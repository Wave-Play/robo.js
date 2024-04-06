interface RoboResponseOptions {
	data?: unknown
	headers?: Record<string, string>
	message: string
	status?: number
}

export class RoboResponse extends Error {
	public readonly data: unknown | undefined
	public readonly headers: Record<string, string> | undefined
	public readonly status: number | undefined

	constructor(options: RoboResponseOptions) {
		super()
		this.data = options.data
		this.headers = options.headers
		this.message = options.message
		this.status = options.status
	}
}
