import { useMemo } from 'react'
import type { StageChannel, StageUser, StageVoiceState } from '../../types/stage'
import { VoiceConnectionCard } from './VoiceConnectionCard'
import { UserControlBar } from './UserControlBar'
import styles from './VoiceControlDock.module.css'

interface VoiceControlDockProps {
	currentUser: StageUser | null
	availableUsers?: StageUser[]
	channels: StageChannel[]
	voiceStates: StageVoiceState[]
	currentUserId?: string
	onLeaveVoice?: (guildId: string) => void
	onUpdateVoiceState?: (guildId: string, updates: { selfMute?: boolean; selfDeaf?: boolean }) => void
	isPlaybackMode?: boolean
}

export function VoiceControlDock({
	currentUser,
	availableUsers = [],
	channels,
	voiceStates,
	currentUserId,
	onLeaveVoice,
	onUpdateVoiceState,
	isPlaybackMode = false
}: VoiceControlDockProps) {
	const resolvedUserId = currentUserId ?? currentUser?.id
	const currentVoiceState = resolvedUserId
		? voiceStates.find((vs) => vs.user_id === resolvedUserId)
		: undefined
	const activeChannel = currentVoiceState?.channel_id
		? channels.find((channel) => channel.id === currentVoiceState.channel_id)
		: null
	const isConnected = Boolean(currentVoiceState?.channel_id)
	const isMuted = Boolean(currentVoiceState?.self_mute || currentVoiceState?.mute)
	const isDeafened = Boolean(currentVoiceState?.self_deaf || currentVoiceState?.deaf)
	const participants = useMemo(() => {
		if (!activeChannel) return []

		const participantMap = new Map<string, StageUser>()
		voiceStates.forEach((voiceState) => {
			if (voiceState.channel_id !== activeChannel.id) return
			const resolved =
				availableUsers.find((candidate) => candidate.id === voiceState.user_id) ??
				voiceState.member?.user ??
				(currentUser?.id === voiceState.user_id ? currentUser : undefined)
			if (resolved) {
				participantMap.set(resolved.id, resolved)
			}
		})

		const list = Array.from(participantMap.values())
		if (resolvedUserId) {
			list.sort((left, right) => {
				if (left.id === resolvedUserId) return -1
				if (right.id === resolvedUserId) return 1
				return 0
			})
		}

		if (list.length === 0 && currentUser) {
			list.push(currentUser)
		}

		return list
	}, [activeChannel, availableUsers, currentUser, resolvedUserId, voiceStates])
	const callState = activeChannel
		? {
				title: 'In a call',
				name: activeChannel.name,
				actionLabel: 'Open Call',
				participants,
				participantCount: participants.length
			}
		: undefined

	const handleDisconnect = () => {
		if (!currentVoiceState?.guild_id) return
		onLeaveVoice?.(currentVoiceState.guild_id)
	}

	const handleToggleMute = () => {
		if (isPlaybackMode || !currentVoiceState?.guild_id || !onUpdateVoiceState) return
		onUpdateVoiceState(currentVoiceState.guild_id, {
			selfMute: !currentVoiceState.self_mute
		})
	}

	const handleToggleDeafen = () => {
		if (isPlaybackMode || !currentVoiceState?.guild_id || !onUpdateVoiceState) return
		onUpdateVoiceState(currentVoiceState.guild_id, {
			selfDeaf: !currentVoiceState.self_deaf
		})
	}

	return (
		<div className={styles.container}>
			{isConnected && (
				<VoiceConnectionCard
					channelName={activeChannel?.name ?? 'Voice Channel'}
					onDisconnect={isPlaybackMode ? undefined : handleDisconnect}
				/>
			)}
			<UserControlBar
				user={currentUser}
				availableUsers={availableUsers}
				isConnected={isConnected}
				isMuted={isMuted}
				isDeafened={isDeafened}
				onToggleMute={handleToggleMute}
				onToggleDeafen={handleToggleDeafen}
				isPlaybackMode={isPlaybackMode}
				callState={callState}
			/>
		</div>
	)
}
