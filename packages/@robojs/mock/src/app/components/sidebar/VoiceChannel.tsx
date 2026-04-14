import { useCallback, useEffect, useRef, useState } from 'react'
import type { StageChannel, StageMember, StageVoiceState, StageUser } from '../../types/stage'
import { useStageData } from '../../hooks/useStageData'
import { getAvatarUrl } from '../../utils/avatar'
import { getDisplayName } from '../../utils'
import { UserProfilePopout } from '../members/UserProfilePopout'
import styles from './VoiceChannel.module.css'
import { FixedTooltip } from '../common/FixedTooltip'
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
	currentUserSpeaking?: boolean
	onOpenPanel?: () => void
	onSelect?: () => void
}

export function VoiceChannel({ channel, voiceStates, users, members, onJoin, onLeave: _onLeave, currentUserId, currentUserSpeaking = false, onOpenPanel, onSelect }: VoiceChannelProps) {
	const { roles, commands, currentUser, botUser, openDM } = useStageData()
	// Filter voice states for this channel
	const membersInChannel = voiceStates.filter((vs) => vs.channel_id === channel.id)
	const isCurrentUserInChannel = currentUserId
		? membersInChannel.some((vs) => vs.user_id === currentUserId)
		: false
	const displayName = channel.name.trim()
	const [isHovered, setIsHovered] = useState(false)
	const [elapsed, setElapsed] = useState(0)
	const [popoutState, setPopoutState] = useState<{ member: StageMember; anchorTop: number } | null>(null)
	const joinedAt = useRef<number | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)

	const handleMemberClick = useCallback((member: StageMember, e: React.MouseEvent) => {
		const rect = e.currentTarget.getBoundingClientRect()
		setPopoutState({ member, anchorTop: rect.top })
	}, [])

	const handleMessageUser = useCallback(async (userId: string) => {
		await openDM(userId)
		setPopoutState(null)
	}, [openDM])

	const hasSlashCommands = commands.some((c) => (c.type ?? 1) === 1)
	const listRight = containerRef.current?.getBoundingClientRect().right ?? 0

	useEffect(() => {
		if (isCurrentUserInChannel) {
			if (joinedAt.current === null) {
				joinedAt.current = Date.now()
			}
			const tick = () => setElapsed(Math.floor((Date.now() - joinedAt.current!) / 1000))
			tick()
			const interval = setInterval(tick, 1000)
			return () => clearInterval(interval)
		} else {
			joinedAt.current = null
			setElapsed(0)
		}
	}, [isCurrentUserInChannel])

	const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0')
	const seconds = String(elapsed % 60).padStart(2, '0')

	return (
		<div ref={containerRef} className={styles.container}>
			<div
				className={`${styles.row} ${isCurrentUserInChannel ? styles.rowJoined : ''}`}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				<button
					className={`${styles.header} ${isCurrentUserInChannel ? styles.joined : ''}`}
					onClick={isCurrentUserInChannel ? onSelect : onJoin}
					aria-label={`Voice channel: ${displayName}${membersInChannel.length > 0 ? `, ${membersInChannel.length} connected` : ''}`}
				>
					<VoiceChannelIcon width={16} height={16} />
					<div className={styles.channelInfo}>
						<span className={styles.channelName}>{displayName}</span>
						{isCurrentUserInChannel && (
							<span className={styles.channelStatus}>
								Set a channel status
								<PencilIcon />
							</span>
						)}
					</div>
					{membersInChannel.length > 0 && !isCurrentUserInChannel && <span className={styles.memberCount}>{membersInChannel.length}</span>}
				</button>
				{isCurrentUserInChannel && !isHovered ? (
					<div className={styles.timer}>{minutes}:{seconds}</div>
				) : (
					<div className={styles.actions}>
						<FixedTooltip label="Open Chat">
							<button type="button" aria-label="Open Chat" onClick={onOpenPanel}>
								<ChatBubbleIcon className={styles.actionIcon} />
							</button>
						</FixedTooltip>
						<FixedTooltip label="Invite to Voice">
							<button type="button" aria-label="Invite to Voice">
								<InviteIcon width={16} height={16} />
							</button>
						</FixedTooltip>
						<FixedTooltip label="Edit Channel">
							<button type="button" aria-label="Edit Channel">
								<CogwheelIcon width={16} height={16} />
							</button>
						</FixedTooltip>
					</div>
				)}
			</div>

			{membersInChannel.length > 0 && (
				<div className={styles.members}>
					{membersInChannel.map((vs) => {
						const user = users.find((u) => u.id === vs.user_id)
						const member = members.find((m) => m.user.id === vs.user_id)
						return (
							<VoiceMember
								key={vs.user_id}
								voiceState={vs}
								user={user}
								member={member}
								speaking={vs.user_id === currentUserId ? currentUserSpeaking : !!vs.speaking}
								onClick={member ? (e) => handleMemberClick(member, e) : undefined}
							/>
						)
					})}
				</div>
			)}

			{popoutState && (
				<UserProfilePopout
					member={popoutState.member}
					roles={roles}
					currentUserId={currentUser?.id}
					botUserId={botUser?.id}
					hasSlashCommands={hasSlashCommands}
					anchorTop={popoutState.anchorTop}
					listLeft={listRight}
					side="right"
					onClose={() => setPopoutState(null)}
					onMessage={handleMessageUser}
				/>
			)}
		</div>
	)
}

interface VoiceMemberProps {
	voiceState: StageVoiceState
	user?: StageUser
	member?: StageMember
	speaking?: boolean
	onClick?: (e: React.MouseEvent) => void
}

function VoiceMember({ voiceState, user, member, speaking = false, onClick }: VoiceMemberProps) {
	const hasIcons = voiceState.self_mute || voiceState.self_deaf || voiceState.mute || voiceState.deaf
	const avatarClassName = `${styles.memberAvatar}${speaking ? ` ${styles.speaking}` : ''}`
	const displayName = getDisplayName(user, member)

	const avatarSrc = user ? getAvatarUrl(user.id, user.avatar ?? null, 32) : null

	return (
		<div className={styles.member} onClick={onClick}>
			<div className={avatarClassName}>
				<img
					src={avatarSrc ?? ''}
					alt=""
					className={styles.avatarImg}
				/>
			</div>
			<span className={`${styles.memberName}${speaking ? ` ${styles.memberNameSpeaking}` : ''}`}>{displayName}</span>

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
			<path fill="currentColor" d="M12 22a10 10 0 1 0-8.45-4.64c.13.19.11.44-.04.61l-2.06 2.37A1 1 0 0 0 2.2 22H12Z" />
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

function PencilIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
			<path d="M13.96 5.46 11.18 8.24l4.58 4.58 2.78-2.78a.63.63 0 0 0 0-.88L14.83 5.46a.63.63 0 0 0-.87 0ZM10.23 9.18l-5.45 5.46-.79 4.44a.63.63 0 0 0 .74.74l4.44-.8 5.45-5.44-4.39-4.4Z" />
		</svg>
	)
}

