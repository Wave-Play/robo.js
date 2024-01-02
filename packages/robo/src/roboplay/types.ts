export interface Robo {
	id: string
	description: string
	name: string
	slug: string
	type: 'BetaMecha' | 'BetaMicrobot'
}

export interface User {
	id: string
	avatar?: string
	displayName: string
	email: string
}
