import type { Client, Room } from 'colyseus.js'
import type { State } from '../entities/State.js'
import type { discordSdk } from '../hooks/useDiscordSdk.js'

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T
export type DiscordSession = UnwrapPromise<ReturnType<typeof discordSdk.commands.authenticate>>

export interface IColyseus {
	room: Room<State>
	client: Client
}
export type TAuthenticatedContext = DiscordSession & { guildMember: IGuildsMembersRead | null } & IColyseus

export interface IGuildsMembersRead {
	roles: string[]
	nick: string | null
	avatar: string | null
	premium_since: string | null
	joined_at: string
	is_pending: boolean
	pending: boolean
	communication_disabled_until: string | null
	user: {
		id: string
		username: string
		avatar: string | null
		discriminator: string
		public_flags: number
	}
	mute: boolean
	deaf: boolean
}
