import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Events } from '@discord/embedded-app-sdk'
import { GameName } from '../core/constants.js'
import { Player } from '../entities/Player.js'
import { State } from '../entities/State.js'
import { useDiscordSdk } from './useDiscordSdk.js'
import { discordSdk } from './useDiscordSdk.js'
import { Client, Room } from 'colyseus.js'
import { getUserAvatarUrl, getUserDisplayName } from '../utils/discord.js'
import type { IColyseus, IGuildsMembersRead } from '../core/types.js'

type TGameContext = { guildMember: IGuildsMembersRead | null } & Partial<IColyseus>

const GameContext = createContext<TGameContext>({
	guildMember: null,
	client: undefined,
	room: undefined
})

const PlayersContext = createContext<Player[]>([])

export function GameContextProvider({ children }: { children: React.ReactNode }) {
	const context = useGameContextSetup()

	return <GameContext.Provider value={context}>{children}</GameContext.Provider>
}

export function useGameContext() {
	return useContext(GameContext)
}

function useGameContextSetup() {
	const { accessToken, session } = useDiscordSdk()
	const isRunning = useRef(false)
	const [guildMember, setGuildMember] = useState<IGuildsMembersRead | null>(null)
	const [client, setClient] = useState<Client | undefined>(undefined)
	const [room, setRoom] = useState<Room<State> | undefined>(undefined)

	const setupGameContext = useCallback(async () => {
		// Get guild specific nickname and avatar, and fallback to user name and avatar
		const guildMember: IGuildsMembersRead | null = await fetch(
			`https://discord.com/api/users/@me/guilds/${discordSdk.guildId}/member`,
			{
				method: 'get',
				headers: { Authorization: `Bearer ${accessToken}` }
			}
		)
			.then((j) => j.json())
			.catch(() => {
				return null
			})

		// Done with discord-specific setup

		// Now we create a colyseus client
		const wsUrl = `wss://${location.host}/.proxy/colyseus`
		const client = new Client(wsUrl)

		let roomName = 'Channel'

		// Requesting the channel in GDMs (when the guild ID is null) requires
		// the dm_channels.read scope which requires Discord approval.
		if (discordSdk.channelId != null && discordSdk.guildId != null) {
			// Over RPC collect info about the channel
			const channel = await discordSdk.commands.getChannel({ channel_id: discordSdk.channelId })
			if (channel.name != null) {
				roomName = channel.name
			}
		}

		// Get the user's guild-specific avatar uri
		// If none, fall back to the user profile avatar
		// If no main avatar, use a default avatar
		const avatarUri = getUserAvatarUrl({
			guildMember,
			user: session!.user
		})

		// Get the user's guild nickname. If none set, fall back to global_name, or username
		// Note - this name is note guaranteed to be unique
		const name = getUserDisplayName({
			guildMember,
			user: session!.user
		})

		// The second argument has to include for the room as well as the current player
		const newRoom = await client.joinOrCreate<State>(GameName, {
			channelId: discordSdk.channelId,
			roomName,
			userId: session!.user.id,
			name,
			avatarUri
		})

		// Finally, we construct our authenticatedContext object to be consumed throughout the app
		setGuildMember(guildMember)
		setClient(client)
		setRoom(newRoom)
	}, [accessToken, session])

	useEffect(() => {
		if (accessToken && session?.user && !isRunning.current) {
			isRunning.current = true
			setupGameContext()
		}
	}, [accessToken, session])

	return { guildMember, client, room }
}

export function PlayersContextProvider({ children }: { children: React.ReactNode }) {
	const players = usePlayersContextSetup()

	return <PlayersContext.Provider value={players}>{children}</PlayersContext.Provider>
}

export function usePlayers() {
	return useContext(PlayersContext)
}

/**
 * This hook sets up listeners for each player so that their state is kept up to date and can be consumed elsewhere in the app
 * One improvement worth considering is using a map instead of an array
 */
function usePlayersContextSetup() {
	const [players, setPlayers] = useState<Player[]>([])
	const { room } = useGameContext()
	const isRunning = useRef(false)
	const { session } = useDiscordSdk()

	useEffect(() => {
		if (!room) {
			return
		}
		if (isRunning.current) {
			return
		}
		isRunning.current = true

		try {
			room.state.players.onAdd((player: Player) => {
				setPlayers((players) => [...players, player])

				// Listen for the talking state of the player
				player.listen('talking', (newValue: boolean) => {
					setPlayers((players) =>
						players.map((p) => {
							if (p.userId === player.userId) {
								p.talking = newValue
							}

							return p
						})
					)
				})
			})

			room.state.players.onRemove((player: Player) => {
				setPlayers((players) => [...players.filter((p) => p.userId !== player.userId)])
			})
		} catch (e) {
			console.error("Couldn't connect:", e)
		}
	}, [room])

	useEffect(() => {
		function handleSpeakingStart({ user_id }: { user_id: string }) {
			if (session?.user?.id === user_id) {
				room?.send('startTalking')
			}
		}
		function handleSpeakingStop({ user_id }: { user_id: string }) {
			if (session?.user?.id === user_id) {
				room?.send('stopTalking')
			}
		}

		discordSdk.subscribe(Events.SPEAKING_START, handleSpeakingStart, { channel_id: discordSdk.channelId })
		discordSdk.subscribe(Events.SPEAKING_STOP, handleSpeakingStop, { channel_id: discordSdk.channelId })
		return () => {
			discordSdk.unsubscribe(Events.SPEAKING_START, handleSpeakingStart)
			discordSdk.unsubscribe(Events.SPEAKING_STOP, handleSpeakingStop)
		}
	}, [room, session])

	return players
}
