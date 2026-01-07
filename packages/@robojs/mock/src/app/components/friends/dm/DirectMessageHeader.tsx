import type { FriendRowData } from '../friends.data'
import { Avatar, IconButton, SearchInput } from '../../ui'
import styles from './DirectMessageHeader.module.css'

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

export function DirectMessageHeader({
	friend,
	profileOpen,
	onToggleProfile
}: {
	friend: FriendRowData
	profileOpen: boolean
	onToggleProfile: () => void
}) {
	const handle = `${friend.username.toLowerCase()}2977`

	return (
		<div className={styles.header}>
			<div className={styles.left}>
				<Avatar imageUrl={null} size={28} showStatus statusBorderColor="var(--main-chat-background)" statusColor="var(--status-online)" />
				<div className={styles.name}>{friend.username}</div>
				<div className={styles.aka}>
					<span className={styles.akaLabel}>AKA</span>
					<span className={styles.akaValue}>고키</span>
				</div>
			</div>
			<div className={styles.right}>
				<IconButton ariaLabel="Start voice call" size="sm">
					<PhoneIcon />
				</IconButton>
				<IconButton ariaLabel="Start video call" size="sm">
					<VideoIcon />
				</IconButton>
				<IconButton ariaLabel="Pinned messages" size="sm">
					<PinIcon />
				</IconButton>
				<IconButton ariaLabel="Add friend to DM" size="sm">
					<AddFriendIcon />
				</IconButton>
				<IconButton
					ariaLabel="Profile"
					size="sm"
					className={profileOpen ? styles.profileActive : undefined}
					onClick={onToggleProfile}
				>
					<ProfileIcon />
				</IconButton>
				<SearchInput placeholder={`Search ${handle}`} className={styles.search} />
			</div>
		</div>
	)
}


