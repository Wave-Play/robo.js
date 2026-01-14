import type { StageChannel, StageMessage } from '../../types/stage'
import styles from './ForumChannelView.module.css'

interface ForumChannelViewProps {
	channel: StageChannel
	threads: StageChannel[]
	messages: Record<string, StageMessage[]>
}

export function ForumChannelView({ channel, threads, messages }: ForumChannelViewProps) {
	const sortedThreads = [...threads].sort((a, b) => (b.message_count ?? 0) - (a.message_count ?? 0))

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<div className={styles.headerInfo}>
					<div className={styles.headerBadge}>Forum</div>
					<h2 className={styles.headerTitle}>{channel.name}</h2>
					<span className={styles.headerSubtitle}>Share updates and start structured discussions.</span>
				</div>
				<div className={styles.headerActions}>
					<div className={styles.search}>
						<SearchIcon />
						<input type="text" placeholder="Search posts" aria-label="Search posts" />
					</div>
					<button type="button" className={styles.newPost}>
						New Post
					</button>
				</div>
			</div>

			<div className={styles.filters}>
				<button type="button" className={`${styles.filterChip} ${styles.active}`}>All</button>
				<button type="button" className={styles.filterChip}>Announcements</button>
				<button type="button" className={styles.filterChip}>Help</button>
				<button type="button" className={styles.filterChip}>Ideas</button>
				<div className={styles.sort}>
					<span>Sort by</span>
					<button type="button" className={styles.sortButton}>
						Latest Activity
						<ChevronIcon />
					</button>
				</div>
			</div>

			<div className={styles.postGrid}>
				{sortedThreads.length === 0 ? (
					<div className={styles.emptyState}>
						<div className={styles.emptyIcon}>
							<PostIcon />
						</div>
						<div className={styles.emptyTitle}>No posts yet</div>
						<div className={styles.emptyText}>Start a new discussion to get the conversation going.</div>
						<button type="button" className={styles.emptyButton}>
							Create Post
						</button>
					</div>
				) : (
					sortedThreads.map((thread) => {
						const preview = messages[thread.id]?.[0]
						return (
							<div key={thread.id} className={styles.postCard}>
								<div className={styles.postHeader}>
									<span className={styles.postTitle}>{thread.name}</span>
									{thread.thread_metadata?.archived && <span className={styles.postArchived}>Archived</span>}
								</div>
								<div className={styles.postPreview}>
									{preview?.content ? preview.content : 'No preview available for this post.'}
								</div>
								<div className={styles.postMeta}>
									<div className={styles.metaRow}>
										<span className={styles.metaLabel}>Replies</span>
										<span className={styles.metaValue}>{thread.message_count ?? 0}</span>
									</div>
									<div className={styles.metaRow}>
										<span className={styles.metaLabel}>Last activity</span>
										<span className={styles.metaValue}>Just now</span>
									</div>
								</div>
								<div className={styles.postFooter}>
									<button type="button" className={styles.postButton}>
										View
									</button>
									<div className={styles.postTag}>Discussion</div>
								</div>
							</div>
						)
					})
				)}
			</div>
		</div>
	)
}

function SearchIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12a6 6 0 0 1 0-12z" />
		</svg>
	)
}

function ChevronIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M7 10l5 5 5-5H7z" />
		</svg>
	)
}

function PostIcon() {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
			<path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2zm2 5h10v2H7V9zm0 4h6v2H7v-2z" />
		</svg>
	)
}
