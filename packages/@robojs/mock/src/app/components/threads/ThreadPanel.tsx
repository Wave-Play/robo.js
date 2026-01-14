import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../../hooks/useSession'
import type { StageMessage } from '../../types/stage'
import { Message } from '../messages/Message'
import { MessageInput } from '../messages/MessageInput'
import ThreadIcon from '../icons/thread'
import NotificationIcon from '../icons/notification'
import styles from './ThreadPanel.module.css'

interface ThreadPanelProps {
	mode: 'create' | 'view'
	parentChannelId: string | null
	threadId: string | null
	onClose: () => void
	onThreadCreated: (threadId: string) => void
	onOpenFullView?: (threadId: string) => void
}

export function ThreadPanel({
	mode,
	parentChannelId,
	threadId,
	onClose,
	onThreadCreated,
	onOpenFullView
}: ThreadPanelProps) {
	const { channels, messages, users, currentUser, createThread, selectChannel, deleteThread } = useSession()
	const [threadName, setThreadName] = useState('')
	const [draftMessage, setDraftMessage] = useState('')
	const [isPrivate, setIsPrivate] = useState(false)
	const [isCreating, setIsCreating] = useState(false)
	const [showMenu, setShowMenu] = useState(false)
	const messagesRef = useRef<HTMLDivElement>(null)
	const menuRef = useRef<HTMLDivElement>(null)

	const parentChannel = useMemo(
		() => channels.find((channel) => channel.id === parentChannelId) || null,
		[channels, parentChannelId]
	)
	const threadChannel = useMemo(
		() => channels.find((channel) => channel.id === threadId) || null,
		[channels, threadId]
	)
	const threadMessages = threadId ? messages[threadId] || [] : []

	const threadOwner = threadChannel?.owner_id
		? users.find((user) => user.id === threadChannel.owner_id)
		: currentUser
	const threadOwnerName = threadOwner?.username || 'Unknown'
	const threadCreatedAt = threadMessages[0]?.timestamp || threadChannel?.thread_metadata?.archive_timestamp
	const threadTitle = (threadChannel?.name || 'Thread').trim()

	const handleCreateThread = async () => {
		if (!parentChannelId) return
		const content = draftMessage.trim()
		if (!content) return
		setIsCreating(true)
		try {
			const created = createThread({
				parentChannelId,
				name: threadName.trim() || 'New Thread',
				content,
				isPrivate
			})
			onThreadCreated(created.id)
			setThreadName('')
			setDraftMessage('')
			setIsPrivate(false)
		} finally {
			setIsCreating(false)
		}
	}

	const handleDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			handleCreateThread()
		}
	}

	useEffect(() => {
		if (!messagesRef.current) return
		messagesRef.current.scrollTop = messagesRef.current.scrollHeight
	}, [threadMessages.length])

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (showMenu && menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowMenu(false)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [showMenu])

	if (mode === 'create') {
		return (
			<aside className={styles.panel} aria-label="Create thread">
				<div className={styles.header}>
					<div className={styles.headerTitle}>
						<ThreadIcon width={18} height={18} />
						<span>New Thread</span>
					</div>
					<button className={styles.iconButton} type="button" aria-label="Close thread panel" onClick={onClose}>
						<CloseIcon />
					</button>
				</div>
				<div className={styles.createBody}>
					<div className={styles.formGroup}>
						<label className={styles.label}>Thread Name</label>
						<input
							className={styles.input}
							type="text"
							placeholder="New Thread"
							value={threadName}
							onChange={(event) => setThreadName(event.target.value)}
						/>
					</div>
					<div className={styles.toggleRow}>
						<div>
							<div className={styles.toggleLabel}>Private Thread</div>
							<div className={styles.toggleHint}>Only people you invite and moderators can see</div>
						</div>
						<label className={styles.toggle}>
							<input
								type="checkbox"
								checked={isPrivate}
								onChange={(event) => setIsPrivate(event.target.checked)}
								aria-label="Private Thread"
							/>
							<span className={styles.slider} />
						</label>
					</div>
					<div className={styles.formGroup}>
						<label className={styles.label}>Message</label>
						<textarea
							className={styles.textarea}
							rows={3}
							placeholder="Enter a message to start the conversation!"
							value={draftMessage}
							onChange={(event) => setDraftMessage(event.target.value)}
							onKeyDown={handleDraftKeyDown}
						/>
					</div>
					<button
						className={styles.createButton}
						type="button"
						onClick={handleCreateThread}
						disabled={isCreating || !draftMessage.trim()}
					>
						Create Thread
					</button>
				</div>
			</aside>
		)
	}

	return (
		<aside className={styles.panel} aria-label="Thread panel">
			<div className={styles.header}>
				<div className={styles.headerTitle}>
					<ThreadIcon width={18} height={18} />
					<span>{threadTitle}</span>
				</div>
				<div className={styles.headerActions}>
					<button className={styles.iconButton} type="button" aria-label="Thread notifications">
						<NotificationIcon width={18} height={18} />
					</button>
					<div className={styles.menu} ref={menuRef}>
						<button
							className={styles.iconButton}
							type="button"
							aria-label="More thread options"
							onClick={() => setShowMenu((prev) => !prev)}
						>
							<MoreIcon />
						</button>
						{showMenu && (
							<div className={styles.menuDropdown}>
								<button
									type="button"
									className={styles.menuItem}
									onClick={() => {
										if (!threadChannel) return
										selectChannel(threadChannel.id)
										onOpenFullView?.(threadChannel.id)
										onClose()
										setShowMenu(false)
									}}
								>
									Open full view
								</button>
								<button
									type="button"
									className={styles.menuItem}
									onClick={() => {
										if (!threadChannel) return
										deleteThread(threadChannel.id)
										onClose()
										setShowMenu(false)
									}}
								>
									Delete thread
								</button>
							</div>
						)}
					</div>
					<button className={styles.iconButton} type="button" aria-label="Close thread panel" onClick={onClose}>
						<CloseIcon />
					</button>
				</div>
			</div>
			<div className={styles.threadBody}>
				<div className={styles.threadIntro}>
					<div className={styles.threadIntroIcon}>
						<ThreadIcon width={26} height={26} />
					</div>
					<div className={styles.threadIntroContent}>
						<div className={styles.threadIntroTitle}>{threadTitle}</div>
						<div className={styles.threadIntroSubtitle}>Started by {threadOwnerName}</div>
					</div>
				</div>
				{threadCreatedAt && (
					<div className={styles.threadDateRow}>
						<span>{formatThreadDate(threadCreatedAt)}</span>
					</div>
				)}
				<div className={styles.threadMessages} ref={messagesRef}>
					{threadMessages.map((message, index) => {
						const prev = threadMessages[index - 1]
						const isFirstInGroup = isFirstMessageInGroup(message, prev)
						return (
							<Message
								key={message.id}
								message={message as StageMessage}
								isFirstInGroup={isFirstInGroup}
								isHighlighted={false}
							/>
						)
					})}
				</div>
				<div className={styles.threadInput}>
					{threadChannel && <MessageInput channelId={threadChannel.id} channelName={threadChannel.name} />}
				</div>
			</div>
		</aside>
	)
}

function isFirstMessageInGroup(message: StageMessage, prevMessage?: StageMessage) {
	if (!prevMessage) return true
	const messageDate = new Date(message.timestamp)
	const prevDate = new Date(prevMessage.timestamp)
	return (
		prevMessage.author.id !== message.author.id ||
		messageDate.getTime() - prevDate.getTime() > 5 * 60 * 1000
	)
}

function formatThreadDate(timestamp: string) {
	const date = new Date(timestamp)
	return date.toLocaleDateString(undefined, {
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	})
}

function CloseIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
			<path d="M18 6L6 18M6 6l12 12" />
		</svg>
	)
}

function MoreIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<circle cx="5" cy="12" r="2" />
			<circle cx="12" cy="12" r="2" />
			<circle cx="19" cy="12" r="2" />
		</svg>
	)
}
