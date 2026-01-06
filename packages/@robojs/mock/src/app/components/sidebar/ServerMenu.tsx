import { useState } from 'react'
import styles from './ServerMenu.module.css'

interface ServerMenuProps {
	onClose: () => void
	onCreateChannel?: () => void
	onCreateCategory?: () => void
	onInviteToServer?: () => void
}

export function ServerMenu({ onClose, onCreateChannel, onCreateCategory, onInviteToServer }: ServerMenuProps) {
	const [hideMutedChannels, setHideMutedChannels] = useState(false)

	const handleToggleMuted = () => {
		setHideMutedChannels(!hideMutedChannels)
	}

	const handleCreateChannel = () => {
		onCreateChannel?.()
		onClose()
	}

	const handleCreateCategory = () => {
		onCreateCategory?.()
		onClose()
	}

	const handleInviteToServer = () => {
		onInviteToServer?.()
		onClose()
	}

	return (
		<div className={styles.menu}>
			<div className={styles.menuItem} onClick={handleToggleMuted}>
				<span className={styles.menuItemText}>Hide Muted Channels</span>
				<div className={styles.checkbox}>
					<input
						type="checkbox"
						checked={hideMutedChannels}
						onChange={handleToggleMuted}
						className={styles.checkboxInput}
						aria-label="Hide muted channels"
					/>
					<div className={`${styles.checkboxBox} ${hideMutedChannels ? styles.checkboxChecked : ''}`}>
						{hideMutedChannels && (
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
								<path
									d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
									fill="currentColor"
								/>
							</svg>
						)}
					</div>
				</div>
			</div>

			<div className={styles.separator} />

			<div className={styles.menuItem} onClick={handleCreateChannel}>
				<span className={styles.menuItemText}>Create Channel</span>
			</div>

			<div className={styles.menuItem} onClick={handleCreateCategory}>
				<span className={styles.menuItemText}>Create Category</span>
			</div>

			<div className={styles.menuItem} onClick={handleInviteToServer}>
				<span className={styles.menuItemText}>Invite to Server</span>
			</div>
		</div>
	)
}
