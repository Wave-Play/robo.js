import { useState, useCallback, useMemo } from 'react'
import type { StageUser } from '../../../types/stage'
import { useStageData } from '../../../hooks/useStageData'
import { getAvatarUrl } from '../../../utils/avatar'
import { Avatar, IconButton } from '../../ui'
import styles from './DirectMessageView.module.css'

function SmileIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm-3 8a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 9 10Zm6 0a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 15 10Zm-6.2 3.2a1 1 0 0 1 1.4 0a3 3 0 0 0 4.2 0a1 1 0 0 1 1.4 1.4a5 5 0 0 1-7 0a1 1 0 0 1 0-1.4Z" />
		</svg>
	)
}

function GiftIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M20 7h-2.2A3 3 0 0 0 12 4.8A3 3 0 0 0 6.2 7H4v4h16V7Zm-9-1.2c0-1 .8-1.8 1.8-1.8S14.6 4.8 14.6 5.8S13.8 7.6 12.8 7.6H11V5.8Zm-1.6 1.8c-1 0-1.8-.8-1.8-1.8S8.4 4 9.4 4s1.8.8 1.8 1.8v1.8H9.4ZM4 13h7v9H4v-9Zm9 0h7v9h-7v-9Z" />
		</svg>
	)
}

function PlusCircleIcon() {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm1 5v4h4v2h-4v4h-2v-4H7v-2h4V7h2Z" />
		</svg>
	)
}

function formatTimestamp(timestamp: string | number | undefined): string {
	if (!timestamp) return ''
	const date = new Date(timestamp)
	return date.toLocaleString('en-US', {
		month: 'numeric',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	})
}

export function DirectMessageView({
	user,
	channelId,
}: {
	user: StageUser
	channelId: string
}) {
	const { messages, sendMessage, users } = useStageData({ channelId })
	const [inputValue, setInputValue] = useState('')

	// Create a map of user IDs to users for quick lookup
	const userMap = useMemo(() => {
		const map = new Map<string, StageUser>()
		for (const u of users) {
			map.set(u.id, u)
		}
		return map
	}, [users])

	const handleSendMessage = useCallback(async () => {
		const content = inputValue.trim()
		if (!content) return

		try {
			await sendMessage(content, channelId)
			setInputValue('')
		} catch (err) {
			console.error('Failed to send message:', err)
		}
	}, [inputValue, channelId, sendMessage])

	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			handleSendMessage()
		}
	}, [handleSendMessage])

	return (
		<div className={styles.root}>
			<div className={styles.body}>
				{messages.length === 0 ? (
					<div className={styles.emptyState}>
						<Avatar imageUrl={user.avatar ? getAvatarUrl(user.id, user.avatar, 80) : null} size={80} />
						<div className={styles.emptyTitle}>{user.username}</div>
						<div className={styles.emptySubtitle}>
							This is the beginning of your direct message history with <strong>@{user.username}</strong>.
						</div>
					</div>
				) : (
					messages.map((m) => {
						const author = userMap.get(m.author.id) ?? m.author
						const avatarUrl = author.avatar ? getAvatarUrl(author.id, author.avatar, 40) : null
						return (
							<div key={m.id} className={styles.msgGroup}>
								<Avatar imageUrl={avatarUrl} size={40} />
								<div className={styles.msgContent}>
									<div className={styles.meta}>
										<div className={styles.author}>{author.username}</div>
										<div className={styles.time}>{formatTimestamp(m.timestamp)}</div>
									</div>
									<div className={styles.text}>{m.content}</div>
								</div>
							</div>
						)
					})
				)}
			</div>

			<div className={styles.composerWrap}>
				<div className={styles.composer}>
					<div className={styles.composerLeft}>
						<IconButton ariaLabel="Add attachment" size="sm">
							<PlusCircleIcon />
						</IconButton>
					</div>
					<input
						className={styles.input}
						placeholder={`Message @${user.username}`}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
					/>
					<div className={styles.composerRight}>
						<IconButton ariaLabel="Gift" size="sm">
							<GiftIcon />
						</IconButton>
						<IconButton ariaLabel="Emoji" size="sm">
							<SmileIcon />
						</IconButton>
					</div>
				</div>
			</div>
		</div>
	)
}
