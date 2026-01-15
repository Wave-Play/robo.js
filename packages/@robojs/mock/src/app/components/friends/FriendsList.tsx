import type { StageUser } from '../../types/stage'
import { Avatar, IconButton } from '../ui'
import { getAvatarUrl } from '../../utils/avatar'
import styles from './FriendsList.module.css'

function MessageIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M4 4h16v12H7l-3 3V4Zm2 2v9.17L6.17 15H18V6H6Z" />
		</svg>
	)
}

function MoreIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 7a2 2 0 1 0 0-4a2 2 0 0 0 0 4Zm0 7a2 2 0 1 0 0-4a2 2 0 0 0 0 4Zm0 7a2 2 0 1 0 0-4a2 2 0 0 0 0 4Z" />
		</svg>
	)
}

function FriendRow({ user, onOpen }: { user: StageUser; onOpen?: (user: StageUser) => void }) {
	const url = user.avatar ? getAvatarUrl(user.id, user.avatar, 32) : null
	const subtitle = user.activities?.[0]?.state?.trim() ?? ''

	return (
		<button className={styles.row} type="button" onClick={() => onOpen?.(user)}>
			<Avatar imageUrl={url} size={32} showStatus statusBorderColor="var(--main-chat-background)" statusColor={`var(--status-${user.status ?? 'online'})`} />
			<div className={styles.info}>
				<div className={styles.name}>{user.username}</div>
				{subtitle ? <div className={styles.sub}>{subtitle}</div> : null}
			</div>
			<div className={styles.actions}>
				<IconButton ariaLabel="Message" size="sm">
					<MessageIcon />
				</IconButton>
				<IconButton ariaLabel="More" size="sm">
					<MoreIcon />
				</IconButton>
			</div>
		</button>
	)
}

export function FriendsList({ users, onOpenUser }: { users: StageUser[]; onOpenUser?: (user: StageUser) => void }) {
	return (
		<div>
			{users.map((user) => (
				<FriendRow key={user.id} user={user} onOpen={onOpenUser} />
			))}
		</div>
	)
}
