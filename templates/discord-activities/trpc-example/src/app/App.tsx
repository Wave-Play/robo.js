import { DiscordContextProvider } from '../hooks/useDiscordSdk'
import { Activity } from './Activity'
import { TRPCProvider } from '@robojs/trpc'
import './App.css'
import { trpc, trpcClient } from '../core/trpc-client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRef } from 'react'

/**
 * 🔒 Set `authenticate` to true to enable Discord authentication
 * You can also set the `scope` prop to request additional permissions
 *
 * Example:
 * ```tsx
 * <DiscordContextProvider authenticate scope={['identify', 'guilds']}>
 * ```
 */
export default function App() {
	const queryClient = useRef(new QueryClient()).current
	return (
		<DiscordContextProvider>
			<QueryClientProvider client={queryClient}>
				<TRPCProvider queryClient={queryClient} trpc={trpc} trpcClient={trpcClient}>
					<Activity />
				</TRPCProvider>
			</QueryClientProvider>
		</DiscordContextProvider>
	)
}
