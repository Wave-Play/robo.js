import type { StageUser } from '../../../types/stage'
import { getAvatarUrl } from '../../../utils/avatar'
import { Avatar } from '../../ui'
import styles from './FriendProfilePanel.module.css'

function UserPlusIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M15 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4Zm-9 2c0-2.4 3-4 6-4c.5 0 1 .05 1.5.14A6.5 6.5 0 0 0 10 16.1V18H4v-2Zm14-2v3h3v2h-3v3h-2v-3h-3v-2h3v-3h2Z" />
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

export function FriendProfilePanel({ user }: { user: StageUser }) {
	const username = user.global_name ?? user.username
	const handle = user.discriminator ? `${user.username.toLowerCase()}#${user.discriminator}` : user.username.toLowerCase()
	const avatarUrl = user.avatar ? getAvatarUrl(user.id, user.avatar, 72) : null

	return (
		<div className={styles.root}>
			<div className={styles.scroll}>
				<div className={styles.banner}>
					<div className={styles.bannerActions} aria-label="Profile actions">
						<button className={['icon-button', styles.bannerBtn].join(' ')} aria-label="Add friend" type="button">
							<UserPlusIcon />
						</button>
						<button className={['icon-button', styles.bannerBtn].join(' ')} aria-label="More" type="button">
							<MoreIcon />
						</button>
					</div>
				</div>

				<div className={styles.content}>
					<div className={styles.identity}>
						<div className={styles.avatarRing}>
							<Avatar
								imageUrl={avatarUrl}
								size={72}
								showStatus
								statusBorderColor="var(--sidebar-left-background)"
								statusColor={`var(--status-${user.status ?? 'online'})`}
							/>
						</div>
						<div className={styles.nameBlock}>
							<div className={styles.name}>{username}</div>
							<div className={styles.sub}>{handle}</div>
						</div>
					</div>

					<div className={styles.card}>
						<div className={styles.cardTitle}>Member Since</div>
						<div className={styles.cardValue}>-</div>
					</div>

					<div className={styles.linkGroup} role="group" aria-label="Mutuals">
						<button className={styles.linkRow} type="button">
							<span>Mutual Servers</span>
							<span className={styles.chev}>&gt;</span>
						</button>
						<button className={styles.linkRow} type="button">
							<span>Mutual Friends</span>
							<span className={styles.chev}>&gt;</span>
						</button>
					</div>

					<div className={styles.footer}>View Full Profile</div>
				</div>
			</div>
		</div>
	)
}
