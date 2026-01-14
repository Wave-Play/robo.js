import { useMemo, useState } from 'react'
import type { StageChannel, StageMessage, StageUser } from '../../types/stage'
import { getAvatarUrl } from '../../utils'
import { DropdownContainer } from '../base'
import ThreadIcon from '../icons/thread'
import styles from './ThreadList.module.css'

interface ThreadListProps {
	threads?: StageChannel[]
	messages?: Record<string, StageMessage[]>
	users?: StageUser[]
	onClose?: () => void
	onCreateThread?: () => void
	onThreadSelect?: (threadId: string) => void
}

function SearchIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12a6 6 0 0 1 0-12Z" />
		</svg>
	)
}

export function ThreadList({
	threads = [],
	messages = {},
	users = [],
	onClose,
	onCreateThread,
	onThreadSelect
}: ThreadListProps) {
	const [search, setSearch] = useState('')
	const filteredThreads = useMemo(() => {
		const query = search.trim().toLowerCase()
		if (!query) return threads
		return threads.filter((thread) => thread.name.toLowerCase().includes(query))
	}, [search, threads])

	const handleCreateThread = () => {
		onCreateThread?.()
		onClose?.()
	}

	const handleThreadSelect = (threadId: string) => {
		onThreadSelect?.(threadId)
		onClose?.()
	}

	return (
		<DropdownContainer placement="bottom-end" className={styles.dropdown} role="dialog" aria-label="Threads">
			<div className={styles.container}>
				<div className={styles.header}>
					<div className={styles.headerIcon}>
						<ThreadIcon width={20} height={20} />
					</div>
					<h2 className={styles.headerTitle}>Threads</h2>
					<div className={styles.searchContainer}>
						<span className={styles.searchIcon} aria-hidden="true">
							<SearchIcon />
						</span>
						<input
							type="text"
							className={styles.searchInput}
							placeholder="Search for Thread Name"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</div>
					<button className={styles.createButton} type="button" onClick={handleCreateThread} disabled={!onCreateThread}>
						Create
					</button>
				</div>

				{filteredThreads.length === 0 ? (
					<div className={styles.emptyWrap}>
						<div className={styles.emptyIcon}>
							<ThreadIcon width={32} height={32} />
						</div>
						<div className={styles.emptyTitle}>There are no threads.</div>
						<div className={styles.emptySub}>
							Stay focused on a conversation with a thread - a temporary text channel.
						</div>
						<button className={styles.emptyCta} type="button" onClick={handleCreateThread} disabled={!onCreateThread}>
							Create Thread
						</button>
					</div>
				) : (
					<>
						<div className={styles.section}>
							<h3 className={styles.sectionTitle}>{filteredThreads.length} Joined Threads</h3>
						</div>
						<div className={styles.threadList}>
							{filteredThreads.map((thread) => {
								const threadMessages = messages[thread.id] || []
								const lastMessage = threadMessages[threadMessages.length - 1]
								const author = lastMessage?.author ?? users.find((user) => user.id === thread.owner_id)
								const authorName = author?.username || 'Unknown'
								const authorAvatar = author ? getAvatarUrl(author.id, author.avatar) : undefined

								const threadName = thread.name.trim()
								const preview = getPreviewText(lastMessage?.content)
								const previewTime = formatRelativeTime(lastMessage?.timestamp)

								return (
									<button
										key={thread.id}
										className={styles.threadItem}
										type="button"
										onClick={() => handleThreadSelect(thread.id)}
									>
										<div className={styles.threadContent}>
											<div className={styles.threadName}>{threadName}</div>
											<div className={styles.threadMetaRow}>
												{authorAvatar && (
													<img src={authorAvatar} alt={authorName} className={styles.threadAuthorAvatar} />
												)}
												<span className={styles.threadMetaText}>{authorName}</span>
												<span className={styles.metaDot}>.</span>
												<span className={styles.threadMetaText}>{preview}</span>
												<span className={styles.metaDot}>.</span>
												<span className={styles.threadMetaText}>{previewTime}</span>
											</div>
										</div>
										{authorAvatar && (
											<div className={styles.threadAvatars}>
												<img
													src={authorAvatar}
													alt={authorName}
													className={styles.participantAvatar}
												/>
											</div>
										)}
									</button>
								)
							})}
						</div>
					</>
				)}
			</div>
		</DropdownContainer>
	)
}

function getPreviewText(content?: string) {
	if (!content) return 'No messages yet.'
	const normalized = content.replace(/\s+/g, ' ').trim()
	return normalized || 'No messages yet.'
}

function formatRelativeTime(timestamp?: string) {
	if (!timestamp) return 'Just now'
	const diff = Date.now() - new Date(timestamp).getTime()
	const minutes = Math.floor(diff / 60000)
	if (minutes < 1) return 'Just now'
	if (minutes === 1) return '1m ago'
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours === 1) return '1h ago'
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	if (days === 1) return '1d ago'
	return `${days}d ago`
}
