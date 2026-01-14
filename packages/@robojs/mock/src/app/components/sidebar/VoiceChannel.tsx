import type { StageChannel, StageMember, StageVoiceState, StageUser } from '../../types/stage'
import { getDisplayName } from '../../utils'
import styles from './VoiceChannel.module.css'
import CogwheelIcon from '../icons/cogwheel'
import InviteIcon from '../icons/invite'
import VoiceChannelIcon from '../icons/voice_channel'

interface VoiceChannelProps {
	channel: StageChannel
	voiceStates: StageVoiceState[]
	users: StageUser[]
	members: StageMember[]
	onJoin: () => void
	onLeave: () => void
	currentUserId?: string
	onOpenPanel?: () => void
}

export function VoiceChannel({ channel, voiceStates, users, members, onJoin, onLeave, currentUserId, onOpenPanel }: VoiceChannelProps) {
	// Filter voice states for this channel
	const membersInChannel = voiceStates.filter((vs) => vs.channel_id === channel.id)
	const isCurrentUserInChannel = currentUserId
		? membersInChannel.some((vs) => vs.user_id === currentUserId)
		: false
	const displayName = channel.name.trim()

	return (
		<div className={styles.container}>
			<div className={styles.row}>
				<button
					className={styles.header}
					onClick={isCurrentUserInChannel ? onLeave : onJoin}
					aria-label={`Voice channel: ${displayName}${membersInChannel.length > 0 ? `, ${membersInChannel.length} connected` : ''}`}
				>
					<VoiceChannelIcon width={16} height={16} />
					<span className={styles.channelName}>{displayName}</span>
					{membersInChannel.length > 0 && <span className={styles.memberCount}>{membersInChannel.length}</span>}
				</button>
				<div className={styles.actions}>
					<button type="button" aria-label="Open voice chat" onClick={onOpenPanel}>
						<ChatBubbleIcon className={styles.actionIcon} />
					</button>
					<button type="button" aria-label="Create invite">
						<InviteIcon width={16} height={16} />
					</button>
					<button type="button" aria-label="Edit channel settings">
						<CogwheelIcon width={16} height={16} />
					</button>
				</div>
			</div>

			{membersInChannel.length > 0 && (
				<div className={styles.members}>
					{membersInChannel.map((vs) => {
						const user = users.find((u) => u.id === vs.user_id)
						const member = members.find((m) => m.user.id === vs.user_id)
						return <VoiceMember key={vs.user_id} voiceState={vs} user={user} member={member} />
					})}
				</div>
			)}
		</div>
	)
}

interface VoiceMemberProps {
	voiceState: StageVoiceState
	user?: StageUser
	member?: StageMember
}

function VoiceMember({ voiceState, user, member }: VoiceMemberProps) {
	const hasIcons = voiceState.self_mute || voiceState.self_deaf || voiceState.mute || voiceState.deaf
	const avatarClassName = `${styles.memberAvatar}${voiceState.speaking ? ` ${styles.speaking}` : ''}`
	const displayName = getDisplayName(user, member)

	return (
		<div className={styles.member}>
			<div className={avatarClassName}>
				{user?.avatar ? (
					<img
						src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`}
						alt=""
						className={styles.avatarImg}
					/>
				) : (
					<DefaultAvatar className={styles.avatarImg} />
				)}
			</div>
			<span className={styles.memberName}>{displayName}</span>

			{hasIcons && (
				<div className={styles.icons}>
					{(voiceState.self_mute || voiceState.mute) && <MicOffIcon className={styles.statusIcon} />}
					{(voiceState.self_deaf || voiceState.deaf) && <HeadphonesOffIcon className={styles.statusIcon} />}
				</div>
			)}
		</div>
	)
}

function ChatBubbleIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none">
			<path
				d="M8 19l-4 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H8z"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

// Muted microphone icon
function MicOffIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M14.99 11C14.99 12.66 13.66 14 12 14C10.34 14 9 12.66 9 11V5C9 3.34 10.34 2 12 2C13.66 2 14.99 3.34 14.99 5L14.99 11ZM12 16.1C14.76 16.1 17.3 14 17.3 11H19C19 14.42 16.28 17.24 13 17.72V21H11V17.72C7.72 17.23 5 14.41 5 11H6.7C6.7 14 9.24 16.1 12 16.1ZM21 4.27L19.73 3L3 19.73L4.27 21L8.46 16.81C9.62 17.81 11.03 18.52 12.58 18.76L13 18.82V21H11V18.82L10.42 18.76C9.42 18.62 8.49 18.27 7.66 17.77L21 4.27Z" />
		</svg>
	)
}

// Deafened headphones icon
function HeadphonesOffIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M21 4.27L19.73 3L3 19.73L4.27 21L6.82 18.45C6.29 17.87 6 17.11 6 16.27V13.5C6 11.85 7.05 10.4 8.5 9.93V15.5H9.5V9.83L11.5 7.83V4C11.5 2.62 12.62 1.5 14 1.5C15.38 1.5 16.5 2.62 16.5 4V11.17L18 9.67V4C18 1.79 16.21 0 14 0C11.79 0 10 1.79 10 4V5.83L6.27 9.56C5.5 10.43 5 11.58 5 12.85V16.27C5 17.35 5.37 18.35 6 19.17L3 22.17L4.27 23.44L21 6.73V4.27ZM15.5 13.17L14 14.67V15.5H15.5V13.17ZM19 12.85V16.27C19 18.33 17.33 20 15.27 20H8.73C8.35 20 7.98 19.95 7.63 19.86L9.08 18.41C9.28 18.47 9.5 18.5 9.73 18.5H15.27C16.5 18.5 17.5 17.5 17.5 16.27V12.85C17.5 12.4 17.38 11.98 17.18 11.62L18.59 10.21C18.85 10.94 19 11.72 19 12.85Z" />
		</svg>
	)
}

// Default avatar for users without one
function DefaultAvatar({ className }: { className?: string }) {
	return (
		<svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
			<rect width="24" height="24" rx="12" fill="var(--card-background)" />
			<path
				d="M12 11.5C13.1046 11.5 14 10.6046 14 9.5C14 8.39543 13.1046 7.5 12 7.5C10.8954 7.5 10 8.39543 10 9.5C10 10.6046 10.8954 11.5 12 11.5Z"
				fill="var(--text-muted)"
			/>
			<path
				d="M12 13C9.33 13 4 14.34 4 17V18.5H20V17C20 14.34 14.67 13 12 13Z"
				fill="var(--text-muted)"
			/>
		</svg>
	)
}
