import type { StageChannel, StageMember, StageUser, StageVoiceState } from '../../types/stage'
import { getAvatarUrl } from '../../utils/avatar'
import { getDisplayName } from '../../utils'
import styles from './VoiceChannelView.module.css'

interface VoiceChannelViewProps {
	channel: StageChannel
	voiceStates: StageVoiceState[]
	users: StageUser[]
	members: StageMember[]
	currentUserId?: string
	onJoin?: () => void
	onLeave?: () => void
}

export function VoiceChannelView({ channel, voiceStates, users, members, currentUserId, onJoin, onLeave }: VoiceChannelViewProps) {
	const membersInChannel = voiceStates.filter((vs) => vs.channel_id === channel.id)
	const isCurrentUserInChannel = currentUserId
		? membersInChannel.some((vs) => vs.user_id === currentUserId)
		: false

	return (
		<div className={styles.container}>
			<div className={styles.hero}>
				<div className={styles.heroInfo}>
					<div className={styles.badge}>Voice Channel</div>
					<h2 className={styles.title}>{channel.name}</h2>
					<p className={styles.subtitle}>
						{membersInChannel.length === 0
							? 'No one is connected yet.'
							: `${membersInChannel.length} connected`}
					</p>
				</div>
				<div className={styles.heroActions}>
					<button
						type="button"
						className={`${styles.heroButton} ${isCurrentUserInChannel ? styles.leave : styles.join}`}
						onClick={isCurrentUserInChannel ? onLeave : onJoin}
					>
						{isCurrentUserInChannel ? 'Disconnect' : 'Join Voice'}
					</button>
					<div className={styles.controlRow}>
						<button type="button" className={styles.controlButton} aria-label="Mute">
							<MicIcon />
						</button>
						<button type="button" className={styles.controlButton} aria-label="Deafen">
							<HeadphonesIcon />
						</button>
						<button type="button" className={styles.controlButton} aria-label="Share Screen">
							<ScreenIcon />
						</button>
						<button type="button" className={styles.controlButton} aria-label="Video">
							<VideoIcon />
						</button>
					</div>
				</div>
			</div>

			<div className={styles.memberSection}>
				<div className={styles.memberHeader}>
					<span>Voice Participants</span>
					<span className={styles.memberCount}>{membersInChannel.length}</span>
				</div>
				<div className={styles.memberGrid}>
					{membersInChannel.length === 0 ? (
						<div className={styles.emptyState}>
							<div className={styles.emptyIcon}>
								<WaveIcon />
							</div>
							<div className={styles.emptyTitle}>Say hello</div>
							<div className={styles.emptyText}>Join the channel to start talking.</div>
						</div>
					) : (
						membersInChannel.map((vs) => {
							const user = users.find((u) => u.id === vs.user_id)
							const member = members.find((m) => m.user.id === vs.user_id)
							const displayName = getDisplayName(user, member)
							return (
								<div key={vs.user_id} className={styles.memberCard}>
									<div className={`${styles.memberAvatar} ${vs.speaking ? styles.speaking : ''}`}>
										<img src={getAvatarUrl(vs.user_id, user?.avatar ?? null)} alt="" />
									</div>
									<div className={styles.memberMeta}>
										<span className={styles.memberName}>{displayName}</span>
										<div className={styles.memberStatus}>
											{(vs.self_mute || vs.mute) && <MicOffIcon />}
											{(vs.self_deaf || vs.deaf) && <HeadphonesOffIcon />}
											{!vs.self_mute && !vs.mute && !vs.self_deaf && !vs.deaf && <span>Connected</span>}
										</div>
									</div>
								</div>
							)
						})
					)}
				</div>
			</div>
		</div>
	)
}

function MicIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4zm-6 10a6 6 0 0 0 5 5.91V21h2v-3.09A6 6 0 0 0 18 12h-2a4 4 0 1 1-8 0H6z" />
		</svg>
	)
}

function HeadphonesIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 3a9 9 0 0 0-9 9v5a4 4 0 0 0 4 4h2v-8H7v-1a5 5 0 0 1 10 0v1h-2v8h2a4 4 0 0 0 4-4v-5a9 9 0 0 0-9-9z" />
		</svg>
	)
}

function ScreenIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
			<path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5l2 3v1H7v-1l2-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v9h16V6H4z" />
		</svg>
	)
}

function VideoIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
			<path d="M3 5h11a2 2 0 0 1 2 2v2.5l4-2v9l-4-2V17a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
		</svg>
	)
}

function WaveIcon() {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
			<path d="M2 12a1 1 0 0 1 1-1h1.5a6.5 6.5 0 0 0 13 0H19a1 1 0 1 1 0 2h-1.5a8.5 8.5 0 0 1-17 0H3a1 1 0 0 1-1-1z" />
		</svg>
	)
}

function MicOffIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M15 10.27V5a3 3 0 0 0-5.12-2.12L15 10.27zm-6-.91V11a3 3 0 0 0 5.12 2.12L9 9.36zM4.27 3L3 4.27l5 5V11a4 4 0 0 0 6.12 3.4l1.46 1.46A6 6 0 0 1 6 12H4a8 8 0 0 0 6 7.75V22h2v-2.25a7.9 7.9 0 0 0 2.3-.86l4.43 4.43L21 22.73z" />
		</svg>
	)
}

function HeadphonesOffIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M21 4.27L19.73 3L3 19.73L4.27 21l2.16-2.16A3.98 3.98 0 0 0 7 19h2v-5.27L11.27 16H9v3h6a3 3 0 0 0 3-3v-2.73l2.73 2.73L21 14.73V4.27zM6 12a6 6 0 0 1 10.87-3.57l1.43-1.43A8 8 0 0 0 4 12v1h2v-1z" />
		</svg>
	)
}
