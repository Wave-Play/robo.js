import type { StageUser } from '../../../types/stage'
import { getAvatarUrl } from '../../../utils/avatar'
import { Avatar, SearchInput } from '../../ui'
import { ControlIconButton } from '../../sidebar/ControlIconButton'
import styles from './DirectMessageTopBar.module.css'

function PhoneIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M6.6 10.8c1.4 2.7 3.9 5.2 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.2c1 .4 2.1.6 3.2.6c.7 0 1.2.5 1.2 1.2V20c0 .7-.5 1.2-1.2 1.2C10 21.2 2.8 14 2.8 5.2C2.8 4.5 3.3 4 4 4h3.2c.7 0 1.2.5 1.2 1.2c0 1.1.2 2.2.6 3.2c.1.4 0 .9-.2 1.2l-2.2 2.2Z" />
		</svg>
	)
}

function VideoIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M3 7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2.2l3.6-2a1 1 0 0 1 1.4.9v8a1 1 0 0 1-1.4.9l-3.6-2V17a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Zm3-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H6Z" />
		</svg>
	)
}

function PinIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M14 2l8 8-3 3v6h-2l-2-2-3 3v2h-2v-2l-3-3-2 2H3v-6L0 10l8-8 3 3 3-3Z" />
		</svg>
	)
}

function AddFriendIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M15 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4Zm-9 2c0-2.4 3-4 6-4c.5 0 1 .05 1.5.14A6.5 6.5 0 0 0 10 16.1V18H4v-2Zm14-2v3h3v2h-3v3h-2v-3h-3v-2h3v-3h2Z" />
		</svg>
	)
}

function ProfileIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z" />
		</svg>
	)
}

export function DirectMessageTopBar({
	user,
	profileOpen,
	onToggleProfile
}: {
	user: StageUser
	profileOpen: boolean
	onToggleProfile: () => void
}) {
	const handle = user.discriminator ? `${user.username.toLowerCase()}#${user.discriminator}` : user.username.toLowerCase()
	const avatarUrl = user.avatar ? getAvatarUrl(user.id, user.avatar, 28) : null

	return (
		<div className={styles.bar}>
			<div className={styles.left}>
				<Avatar imageUrl={avatarUrl} size={28} showStatus statusBorderColor="var(--main-chat-background)" statusColor={`var(--status-${user.status ?? 'online'})`} />
				<div className={styles.name}>{user.username}</div>
			</div>
			<div className={styles.right}>
				<ControlIconButton label="Start voice call" size="sm" tooltipPlacement="bottom">
					<PhoneIcon />
				</ControlIconButton>
				<ControlIconButton label="Start video call" size="sm" tooltipPlacement="bottom">
					<VideoIcon />
				</ControlIconButton>
				<ControlIconButton label="Pinned messages" size="sm" tooltipPlacement="bottom">
					<PinIcon />
				</ControlIconButton>
				<ControlIconButton label="Add friend to DM" size="sm" tooltipPlacement="bottom">
					<AddFriendIcon />
				</ControlIconButton>
				<ControlIconButton
					label="Profile"
					size="sm"
					tooltipPlacement="bottom"
					className={profileOpen ? styles.profileActive : undefined}
					onClick={onToggleProfile}
				>
					<ProfileIcon />
				</ControlIconButton>
				<SearchInput placeholder={`Search ${handle}`} className={styles.search} />
			</div>
		</div>
	)
}
