import { createTRPCClient, createTRPCReact, httpBatchLink } from '@robojs/trpc'
//import { createTRPCClient, createTRPCReact, httpBatchLink } from '@trpc/react-query'
import type { AppRouter } from './trpc'

export const trpc = createTRPCReact<AppRouter>()
export const trpcClient = createTRPCClient<AppRouter>({
	links: [
			httpBatchLink({
					url: `http://localhost:3036/trpc`,
					async headers() {
							return {
									'Content-Type': 'application/json',
							};
					},
			}),
	],
});

