import { DiscordContextProvider } from '../hooks/useDiscordSdk'
import { Activity } from './Activity'
import './App.css'

export default function App() {
	return (
		<DiscordContextProvider authenticate={false}>
			<Activity />
		</DiscordContextProvider>
	)
}
