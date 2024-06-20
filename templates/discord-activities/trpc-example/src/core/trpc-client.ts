import { createTRPCProxyClient, createTRPCReact, httpBatchLink } from '@trpc/react-query'
import type { AppRouter } from './trpc'

export const trpc = createTRPCReact<AppRouter>()
export const trpcClient = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: '/api/trpc',
			async headers() {
				return {}
			}
		})
	]
})
