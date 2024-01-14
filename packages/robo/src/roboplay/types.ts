export interface ListResult<T = unknown> {
	data: T[]
	success: boolean
}

export interface Pod {
	id: string
	name: string
	robo: Robo | null
	slug: string
	status: 'Deploying' | 'Idle' | 'Online' | 'Ready' | 'Repairing'
	type: 'BetaMecha' | 'BetaMicro'
}

export interface Robo {
	id: string
	description: string
	name: string
	slug: string
}

export interface User {
	id: string
	avatar?: string
	displayName: string
	email: string
}
