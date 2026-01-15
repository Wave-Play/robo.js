import type { StageUser } from '../../types/stage'
import { useStageData } from '../../hooks/useStageData'
import { getAvatarUrl } from '../../utils/avatar'
import styles from './ActiveNowPanel.module.css'
import { Avatar } from '../ui'

export function ActiveNowPanel() {
	const { users } = useStageData()

	// Filter for non-bot users who have activities
	const activeUsers = users.filter((u) => !u.bot && u.activities && u.activities.length > 0)

	if (activeUsers.length === 0) {
		return (
			<div>
				<div className={styles.header}>Active Now</div>
				<div className={styles.wrap}>
					<div className={styles.emptyState}>
						<div className={styles.emptyText}>It's quiet for now...</div>
						<div className={styles.emptySubtext}>When a friend starts an activity—like playing a game or hanging out on voice—we'll show it here!</div>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div>
			<div className={styles.header}>Active Now</div>
			<div className={styles.wrap}>
				{activeUsers.map((user) => (
					<ActiveUserCard key={user.id} user={user} />
				))}
			</div>
		</div>
	)
}

function ActiveUserCard({ user }: { user: StageUser }) {
	const avatarUrl = user.avatar ? getAvatarUrl(user.id, user.avatar, 32) : null
	const activity = user.activities?.[0]
	const activityName = activity?.name ?? ''
	const activityState = activity?.state ?? ''

	return (
		<div className={styles.card}>
			<div className={styles.cardTop}>
				<Avatar imageUrl={avatarUrl} size={32} showStatus statusBorderColor="var(--main-chat-background)" statusColor={`var(--status-${user.status ?? 'online'})`} />
				<div className={styles.nameBlock}>
					<div className={styles.name}>{user.username}</div>
					{activityName && <div className={styles.sub}>{activityName}</div>}
				</div>
			</div>

			{activityState && (
				<div className={styles.preview}>
					<div className={styles.previewTitle}>{activityState}</div>
				</div>
			)}
		</div>
	)
}
