import { getAvatarUrl } from '../../utils/avatar'
import styles from './ActiveNowPanel.module.css'
import { Avatar } from '../ui'

export function ActiveNowPanel() {
	const userId = '3'
	const avatarHash = null
	const url = avatarHash ? getAvatarUrl(userId, avatarHash, 32) : null

	return (
		<div>
			<div className={styles.header}>Active Now</div>
			<div className={styles.wrap}>
				<div className={styles.card}>
					<div className={styles.cardTop}>
						<Avatar imageUrl={url} size={32} showStatus statusBorderColor="var(--main-chat-background)" statusColor="var(--status-online)" />
						<div className={styles.nameBlock}>
							<div className={styles.name}>MrBatata</div>
							<div className={styles.sub}>Code – 1h</div>
						</div>
					</div>

					<div className={styles.preview}>
						<div className={styles.previewTitle}>In Xeon Project - 35 problems found</div>
						<div className={styles.previewMeta}>Working on build.rs:1,225:9</div>
						<div className={styles.previewMeta}>01:44:37 elapsed</div>
					</div>
				</div>
			</div>
		</div>
	)
}


