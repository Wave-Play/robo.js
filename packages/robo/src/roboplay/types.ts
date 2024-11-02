export interface Deployment {
	id: string
	completedAt?: string
	createdAt?: string
	error?: string
	robo?: Robo
	source?: string
	startedAt?: string
	status?: string
	steps?: DeploymentStep[]
	user?: User
}

export interface DeploymentLog {
	message: string
	timestamp: string
}

export interface DeploymentStep {
	id: string
	completedAt?: string
	name?: string
	startedAt?: string
	status?: 'Completed' | 'Failed' | 'Ignored' | 'Pending' | 'Running'
}

export interface ListResult<T = unknown> {
	data: T[]
	success: boolean
}

export type OAuthSessionStatus = 'Authorized' | 'Created' | 'Expired' | 'Invalid' | 'Paired' | 'Used'

export interface OAuthSession {
	secret: string
	status: OAuthSessionStatus
	token: string
	url: string
}

export interface Pod {
	id: string
	name: string
	robo: Robo | null
	slug: string
	status: 'Deploying' | 'Idle' | 'Online' | 'Ready' | 'Repairing' | 'Updating'
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
