import { createTRPCClient, createTRPCReact, httpBatchLink } from '@robojs/trpc'
import type { AppRouter } from './server'

const batchLink = httpBatchLink({
	url: '/api/trpc',
	async headers() {
		return {}
	}
})

export const trpc = createTRPCReact<AppRouter>()
export const trpcClient = createTRPCClient<AppRouter>({
	links: [batchLink]
})
export const trpcQueryClient = trpc.createClient({
	links: [batchLink]
})
