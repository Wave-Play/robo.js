import { DropdownContainer } from '../base'
import ThreadIcon from '../icons/thread'
import styles from './ThreadList.module.css'

interface Thread {
	id: string
	name: string
	authorName: string
	authorAvatar?: string
	lastActive: string
	participants: Array<{
		id: string
		avatar?: string
		name: string
	}>
}

interface ThreadListProps {
	threads?: Thread[]
	onClose?: () => void
}

function SearchIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12a6 6 0 0 1 0-12Z" />
		</svg>
	)
}

export function ThreadList({ threads = [], onClose }: ThreadListProps) {
	return (
		<DropdownContainer placement="bottom-end" className={styles.dropdown} role="dialog" aria-label="Threads">
			<div className={styles.container}>
			<div className={styles.header}>
				<div className={styles.headerIcon}>
					<ThreadIcon width={20} height={20} fill="var(--interactive-default)" />
				</div>
				<h2 className={styles.headerTitle}>Threads</h2>
				<div className={styles.searchContainer}>
					<span className={styles.searchIcon} aria-hidden="true">
						<SearchIcon />
					</span>
					<input type="text" className={styles.searchInput} placeholder="Search for Thread Name" />
				</div>
				<button className={styles.createButton} type="button">
					Create
				</button>
				<button className={styles.closeButton} type="button" onClick={onClose} aria-label="Close threads panel">
					<CloseIcon />
				</button>
			</div>

			{threads.length === 0 ? (
				<div className={styles.emptyWrap}>
					<div className={styles.emptyIcon}>
						<ThreadIcon width={32} height={32} fill="var(--interactive-default)" />
					</div>
					<div className={styles.emptyTitle}>There are no threads.</div>
					<div className={styles.emptySub}>
						Stay focused on a conversation with a thread - a temporary text channel.
					</div>
					<button className={styles.emptyCta} type="button">
						Create Thread
					</button>
				</div>
			) : (
				<>
					<div className={styles.section}>
						<h3 className={styles.sectionTitle}>Older Threads</h3>
					</div>
					<div className={styles.threadList}>
						{threads.map((thread) => (
							<div key={thread.id} className={styles.threadItem}>
								<div className={styles.threadContent}>
									<div className={styles.threadName}>{thread.name}</div>
									<div className={styles.threadMeta}>
										{thread.authorAvatar && (
											<img src={thread.authorAvatar} alt={thread.authorName} className={styles.threadAuthorAvatar} />
										)}
										<span>Started by</span>
										<span className={styles.threadAuthorName}>{thread.authorName}</span>
										<span className={styles.metaDot}>·</span>
										<span>Last active {thread.lastActive}</span>
									</div>
								</div>
								<div className={styles.threadAvatars}>
									{thread.participants.slice(0, 3).map((participant, index) => (
										<img
											key={participant.id}
											src={participant.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}
											alt={participant.name}
											className={styles.participantAvatar}
											style={{ zIndex: 3 - index }}
										/>
									))}
								</div>
							</div>
						))}
					</div>
				</>
			)}
			</div>
		</DropdownContainer>
	)
}

function CloseIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.3-6.3z" />
		</svg>
	)
}
