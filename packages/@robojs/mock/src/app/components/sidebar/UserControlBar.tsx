import { useMemo } from 'react'
import type { StageUser } from '../../types/stage'
import { useDropdown } from '../base'
import { getAvatarUrl } from '../../utils/avatar'
import MicIcon from '../icons/mic'
import HeadphonesIcon from '../icons/headphones'
import CogwheelIcon from '../icons/cogwheel'
import { ControlIconButton } from './ControlIconButton'
import { UserProfilePopout } from './UserProfilePopout'
import styles from './UserControlBar.module.css'

interface UserControlBarProps {
	user: StageUser | null
	availableUsers?: StageUser[]
	isConnected: boolean
	isMuted: boolean
	isDeafened: boolean
	onToggleMute?: () => void
	onToggleDeafen?: () => void
	onOpenSettings?: () => void
	isPlaybackMode?: boolean
	callState?: {
		title?: string
		name?: string
		actionLabel?: string
		participants?: StageUser[]
		participantCount?: number
	}
}

export function UserControlBar({
	user,
	availableUsers = [],
	isConnected,
	isMuted,
	isDeafened,
	onToggleMute,
	onToggleDeafen,
	onOpenSettings,
	isPlaybackMode = false,
	callState
}: UserControlBarProps) {
	const { containerRef, isOpen, toggle, close } = useDropdown({ closeOnClickOutside: true, closeOnEscape: true })

	const statusLabel = useMemo(() => {
		if (!user) return 'Not connected'
		switch (user.status) {
			case 'idle':
				return 'Idle'
			case 'dnd':
				return 'Do Not Disturb'
			case 'offline':
				return 'Invisible'
			default:
				return 'Online'
		}
	}, [user])
	const displayName = user?.global_name ?? user?.username ?? 'Not connected'

	const canToggleVoice = isConnected && !isPlaybackMode

	return (
		<div className={styles.container} ref={containerRef}>
			<button
				type="button"
				className={styles.identity}
				onClick={user ? toggle : undefined}
				disabled={!user}
				aria-haspopup="dialog"
				aria-expanded={isOpen}
			>
				<div className={styles.avatarWrapper}>
					{user ? (
						<img
							className={styles.avatar}
							src={getAvatarUrl(user.id, user.avatar, 64)}
							alt=""
						/>
					) : (
						<div className={styles.avatarPlaceholder} />
					)}
					{user && <span className={`${styles.status} ${styles[user.status || 'online']}`} />}
				</div>
				<div className={styles.userInfo}>
					<span className={styles.username}>{displayName}</span>
					<span className={styles.statusText}>{statusLabel}</span>
				</div>
			</button>

			<div className={styles.actions}>
				<ControlIconButton
					label="Mute"
					isActive={isMuted}
					tone={isMuted ? 'danger' : 'default'}
					size="sm"
					isDisabled={!canToggleVoice || !onToggleMute}
					onClick={onToggleMute}
				>
					<MicIcon />
				</ControlIconButton>
				<ControlIconButton
					label="Deafen"
					isActive={isDeafened}
					tone={isDeafened ? 'danger' : 'default'}
					size="sm"
					isDisabled={!canToggleVoice || !onToggleDeafen}
					onClick={onToggleDeafen}
				>
					<HeadphonesIcon />
				</ControlIconButton>
				<ControlIconButton
					label="Settings"
					onClick={onOpenSettings}
					isDisabled={!user || !onOpenSettings}
					size="sm"
				>
					<CogwheelIcon width={20} height={20} fill="currentColor" />
				</ControlIconButton>
			</div>

			{user && isOpen && (
				<UserProfilePopout
					user={user}
					availableUsers={availableUsers}
					onClose={close}
					callState={callState}
				/>
			)}
		</div>
	)
}
