import PinIcon from '../icons/pin'
import { DropdownContainer } from '../base'
import { assetUrl } from '../../utils/api'
import styles from './PinnedMessagesDropdown.module.css'

interface PinnedMessage {
	id: string
	authorName: string
	authorAvatar?: string
	content: string
	timestamp: string
}

interface PinnedMessagesDropdownProps {
	messages?: PinnedMessage[]
	onClose?: () => void
}

export function PinnedMessagesDropdown({ messages = [], onClose }: PinnedMessagesDropdownProps) {
	const hasMessages = messages.length > 0

	return (
		<DropdownContainer placement="bottom-end" className={styles.container} role="dialog" aria-label="Pinned Messages">
			<div className={styles.header}>
				<div className={styles.headerIcon}>
					<PinIcon width={24} height={24} />
				</div>
				<h2 className={styles.headerTitle}>Pinned Messages</h2>
			</div>

			{hasMessages ? (
				<div className={styles.content}>
					{messages.map((message) => (
						<div key={message.id} className={styles.messageCard}>
							<img
								src={message.authorAvatar || assetUrl('/avatars/0.png')}
								alt={message.authorName}
								className={styles.avatar}
							/>
							<div className={styles.messageContent}>
								<div className={styles.messageHeader}>
									<span className={styles.username}>{message.authorName}</span>
									<span className={styles.timestamp}>{message.timestamp}</span>
								</div>
								<div className={styles.messageText}>{message.content}</div>
							</div>
							<div className={styles.messageActions}>
								<button className={styles.jumpButton} onClick={onClose}>
									Jump
								</button>
								<button className={styles.closeButton} onClick={onClose}>
									<CloseIcon />
								</button>
							</div>
						</div>
					))}
				</div>
			) : (
				<>
					<div className={styles.emptyState}>
						<div className={styles.emptyIcon}>
							<div className={styles.sadFace}>
								<div className={styles.eyes}>
									<div className={styles.eye} />
									<div className={styles.eye} />
								</div>
								<div className={styles.mouth} />
							</div>
							<div className={styles.pinOverlay}>
								<PinIcon width={28} height={28} />
							</div>
						</div>
						<p className={styles.emptyText}>
							This channel doesn't have any
							<br />
							pinned messages... yet.
						</p>
					</div>
					<div className={styles.footer}>
						<div className={styles.protipLabel}>PROTIP:</div>
						<p className={styles.protipText}>
							Users with the 'Pin Messages' permission can pin a message from its context menu.
						</p>
					</div>
				</>
			)}
		</DropdownContainer>
	)
}

function CloseIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
		</svg>
	)
}
