import { DiscordContextProvider } from '../hooks/useDiscordSdk'
import { Activity } from './Activity'
import { TRPCProvider } from '@robojs/trpc'
import './App.css'
import { trpc, trpcQueryClient } from '../trpc/client'

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
	return (
		<DiscordContextProvider>
				<TRPCProvider trpc={trpc} trpcClient={trpcQueryClient}>
					<Activity />
				</TRPCProvider>
		</DiscordContextProvider>
	)
}
