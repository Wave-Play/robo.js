import { getPluginOptions, portal } from 'robo.js'

export let serverPrefix = '/api'

export default async () => {
	const packageName = `@robojs/server`
	const options = getPluginOptions(packageName) as { prefix?: string | null | false } | null
	const prefix = options?.prefix
	serverPrefix = prefix === undefined ? '/api' : prefix || ''

	// Load the trpc route into the portal so handler records exist for HMR reloads.
	// The portal lazy-loads routes in dev mode; without this, reloadHandlerByPath
	// would find an empty route and silently fail to re-import the module.
	await portal.ensureRoute('trpc', 'trpc')
}
