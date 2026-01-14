import styles from './Avatar.module.css'

export interface AvatarProps {
	imageUrl?: string | null
	size?: number
	showStatus?: boolean
	statusBorderColor?: string
	statusColor?: string
}

function DefaultAvatar({ size }: { size: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
			<rect width="32" height="32" rx="16" fill="var(--brand-primary)" />
			<path
				d="M16 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-8 18c0-4.42 3.58-8 8-8s8 3.58 8 8"
				fill="white"
				opacity="0.85"
			/>
		</svg>
	)
}

export function Avatar({
	imageUrl,
	size = 32,
	showStatus = false,
	statusBorderColor,
	statusColor
}: AvatarProps) {
	return (
		<div
			className={styles.wrap}
			style={{
				['--avatar-size' as any]: `${size}px`,
				...(statusBorderColor ? { ['--avatar-status-border' as any]: statusBorderColor } : null),
				...(statusColor ? { ['--avatar-status-color' as any]: statusColor } : null)
			}}
		>
			<div className={styles.avatar}>{imageUrl ? <img src={imageUrl} alt="" /> : <DefaultAvatar size={size} />}</div>
			{showStatus && <div className={styles.statusDot} />}
		</div>
	)
}


