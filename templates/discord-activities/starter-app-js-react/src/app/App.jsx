import { DiscordContextProvider } from '../hooks/useDiscordSdk'
import { Activity } from './Activity'
import './App.css'

/**
 * Set `authenticate` to true to enable Discord authentication.
 * You can also set the `scope` prop to request additional permissions.
 *
 * ```
 * <DiscordContextProvider authenticate scope={['identify', 'guilds']}>
 *  <Activity />
 * </DiscordContextProvider>
 * ```
 */
export default function App() {
	return (
		<DiscordContextProvider>
			<Activity />
		</DiscordContextProvider>
	)
}
