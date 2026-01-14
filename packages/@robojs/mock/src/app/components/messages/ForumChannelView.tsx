import { useMemo, useState } from 'react'
import type { StageChannel, StageMessage } from '../../types/stage'
import ForumIcon from '../icons/forum'
import styles from './ForumChannelView.module.css'

interface ForumChannelViewProps {
	channel: StageChannel
	threads: StageChannel[]
	messages: Record<string, StageMessage[]>
	onCreatePost: (title: string, content: string) => Promise<StageChannel | null> | StageChannel | null
	onOpenThread: (threadId: string) => void
}

interface PostCard {
	thread: StageChannel
	preview?: string
	author?: string
	timestamp?: string
	replyCount: number
}

const MAX_PREVIEW_LENGTH = 140

export function ForumChannelView({ channel, threads, messages, onCreatePost, onOpenThread }: ForumChannelViewProps) {
	const [search, setSearch] = useState('')
	const [isComposing, setIsComposing] = useState(false)
	const [title, setTitle] = useState('')
	const [body, setBody] = useState('')
	const [isPosting, setIsPosting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const posts = useMemo<PostCard[]>(() => {
		const term = search.trim().toLowerCase()
		return threads
			.map((thread) => {
				const threadMessages = messages[thread.id] || []
				const firstMessage = threadMessages[0]
				const lastMessage = threadMessages[threadMessages.length - 1] ?? firstMessage
				const totalMessages = thread.message_count ?? threadMessages.length
				const replyCount = Math.max((totalMessages || threadMessages.length) - 1, 0)

				return {
					thread,
					preview: firstMessage?.content,
					author: firstMessage?.author?.username,
					timestamp: lastMessage?.timestamp ?? thread.thread_metadata?.archive_timestamp,
					replyCount
				}
			})
			.filter((post) => {
				if (!term) return true
				const haystack = `${post.thread.name} ${post.preview ?? ''}`.toLowerCase()
				return haystack.includes(term)
			})
			.sort((a, b) => {
				const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0
				const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0
				return bTime - aTime
			})
	}, [messages, search, threads])

	const handleSubmitPost = async () => {
		if (!title.trim()) {
			setError('Add a title to your post.')
			return
		}

		setIsPosting(true)
		try {
			await onCreatePost(title.trim(), body.trim())
			setTitle('')
			setBody('')
			setIsComposing(false)
			setError(null)
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to publish post'
			setError(message || 'Failed to publish post')
			return
		} finally {
			setIsPosting(false)
		}
	}

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<div className={styles.channelMeta}>
					<div className={styles.channelIcon}>
						<ForumIcon width={18} height={18} />
					</div>
					<div>
						<div className={styles.channelName}>{channel.name.trim()}</div>
						<div className={styles.channelSubtitle}>Search or start a post to keep discussions organised.</div>
					</div>
				</div>
				<div className={styles.searchRow}>
					<div className={styles.searchBox}>
						<SearchIcon />
						<input
							type="text"
							placeholder="Search or create a post..."
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							aria-label="Search posts"
						/>
					</div>
					<button className={styles.primaryButton} type="button" onClick={() => setIsComposing(true)}>
						<CommentIcon />
						New Post
					</button>
				</div>
			</header>

			<div className={styles.toolbar}>
				<button className={styles.sortButton} type="button">
					<SortIcon />
					Sort &amp; view
					<ChevronIcon />
				</button>
			</div>

			{isComposing && (
				<div className={styles.composer}>
					<div className={styles.composerHeader}>
						<input
							type="text"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Title"
							className={styles.titleInput}
							aria-label="Post title"
						/>
						<button className={styles.closeComposer} onClick={() => setIsComposing(false)} aria-label="Close composer" type="button">
							<CloseIcon />
						</button>
					</div>
					<textarea
						value={body}
						onChange={(event) => setBody(event.target.value)}
						placeholder="Enter a message..."
						className={styles.bodyInput}
						rows={3}
					/>
					{error && <div className={styles.error}>{error}</div>}
					<div className={styles.composerFooter}>
						<div className={styles.composerHint}>Posts are visible to everyone in this forum.</div>
						<div className={styles.composerActions}>
							<button className={styles.secondaryButton} type="button" onClick={() => setIsComposing(false)}>
								Cancel
							</button>
							<button
								className={styles.primaryButton}
								type="button"
								onClick={handleSubmitPost}
								disabled={isPosting || !title.trim()}
							>
								{isPosting ? 'Posting…' : 'Post'}
							</button>
						</div>
					</div>
				</div>
			)}

			<div className={styles.postList}>
				{posts.length === 0 ? (
					<div className={styles.emptyState}>
						<div className={styles.emptyIcon}>
							<ForumIcon width={24} height={24} />
						</div>
						<div className={styles.emptyTitle}>No posts yet</div>
						<div className={styles.emptyText}>Start a discussion to kick things off.</div>
						<button className={styles.primaryButton} type="button" onClick={() => setIsComposing(true)}>
							Create Post
						</button>
					</div>
				) : (
					posts.map((post) => (
						<button
							key={post.thread.id}
							className={styles.postCard}
							type="button"
							onClick={() => onOpenThread(post.thread.id)}
						>
							<div className={styles.postHeader}>
								<div className={styles.postTitle}>{post.thread.name.trim()}</div>
								{post.thread.thread_metadata?.archived && <span className={styles.postBadge}>Archived</span>}
							</div>
							<div className={styles.postPreview}>{post.preview ? truncatePreview(post.preview) : 'No messages yet.'}</div>
							<div className={styles.postMeta}>
								<span className={styles.metaItem}>
									<CommentIcon />
									{post.replyCount}
								</span>
								<span className={styles.dot} />
								<span className={styles.metaItem}>{post.author ?? 'Someone'}</span>
								<span className={styles.dot} />
								<span className={styles.metaItem}>{formatRelativeTime(post.timestamp)}</span>
							</div>
						</button>
					))
				)}
			</div>
		</div>
	)
}

function truncatePreview(content: string) {
	if (content.length <= MAX_PREVIEW_LENGTH) return content
	return `${content.slice(0, MAX_PREVIEW_LENGTH).trim()}…`
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

function SearchIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12a6 6 0 0 1 0-12z" />
		</svg>
	)
}

function ChevronIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M7 10l5 5 5-5H7z" />
		</svg>
	)
}

function CommentIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M20 2H4a2 2 0 0 0-2 2v14l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
		</svg>
	)
}

function SortIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M3 18h6v-2H3v2zm0-5h12v-2H3v2zm0-7v2h18V6H3z" />
		</svg>
	)
}

function CloseIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
			<path d="M18 6L6 18M6 6l12 12" />
		</svg>
	)
}
