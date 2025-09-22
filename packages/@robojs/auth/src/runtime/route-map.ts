export type HttpMethod = 'GET' | 'POST'

export interface RouteConfig {
	method: HttpMethod
	path: string
}

export const AUTH_ROUTES: RouteConfig[] = [
	{ method: 'GET', path: '/providers' },
	{ method: 'GET', path: '/session' },
	{ method: 'GET', path: '/csrf' },
	{ method: 'GET', path: '/signin' },
	{ method: 'GET', path: '/signin/:provider' },
	{ method: 'POST', path: '/signin' },
	{ method: 'POST', path: '/signin/:provider' },
	{ method: 'POST', path: '/signout' },
	{ method: 'GET', path: '/callback/:provider' },
	{ method: 'POST', path: '/callback/:provider' },
	{ method: 'GET', path: '/verify-request' },
	{ method: 'GET', path: '/error' }
]
