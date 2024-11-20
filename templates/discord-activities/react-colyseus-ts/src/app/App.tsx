import { DiscordContextProvider } from '../hooks/useDiscordSdk.js'
import { Activity } from './Activity.js'
import { LoadingScreen } from '../components/LoadingScreen.js'
import { GameContextProvider, PlayersContextProvider } from '../hooks/usePlayers.js'
import './global.css'

/**
 * 🔒 Set `authenticate` to true to enable Discord authentication
 * You can also set the `scope` prop to request additional permissions
 *
 * Example:
 * ```
 * <DiscordContextProvider authenticate scope={['identify', 'guilds']}>
 *  <Activity />
 * </DiscordContextProvider>
 * ```
 */
export default function App() {
	return (
		<DiscordContextProvider
			authenticate
			loadingScreen={<LoadingScreen />}
			scope={['identify', 'guilds', 'guilds.members.read', 'rpc.voice.read']}
		>
			<GameContextProvider>
				<PlayersContextProvider>
					<Activity />
				</PlayersContextProvider>
			</GameContextProvider>
		</DiscordContextProvider>
	)
}
