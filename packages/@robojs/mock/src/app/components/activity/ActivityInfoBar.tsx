import styles from './ActivityInfoBar.module.css'

interface ActivityInfoBarProps {
	activityName: string
	channelName: string
	guildName: string
}

export function ActivityInfoBar({ activityName, channelName, guildName }: ActivityInfoBarProps) {
	return (
		<div className={styles.container}>
			<div className={styles.row}>
				<span className={styles.icon}>
					<ActivityIcon />
				</span>
				{activityName}
			</div>
			<div className={styles.context}>
				{channelName} / {guildName}
			</div>
		</div>
	)
}

function ActivityIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9Z" />
		</svg>
	)
}
