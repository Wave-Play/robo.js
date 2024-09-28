import { createTRPCClient, createTRPCReact, httpBatchLink } from '@robojs/trpc'
import type { AppRouter } from './server'

// Change "/api" if you have a different server prefix
const batchLink = httpBatchLink({
	url: '/api/trpc',
	async headers() {
		return {}
	}
})

// Use this as a React Query client replacement
export const trpc = createTRPCReact<AppRouter>()

// Use this as a standalone client (directly calling queries)
export const trpcClient = createTRPCClient<AppRouter>({
	links: [batchLink]
})

// Pass this to the TRPCProvider
export const trpcQueryClient = trpc.createClient({
	links: [batchLink]
})
