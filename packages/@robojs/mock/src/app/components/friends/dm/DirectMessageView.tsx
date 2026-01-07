import { useMemo } from 'react'
import type { FriendRowData } from '../friends.data'
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

type ChatLine = {
	id: string
	author: string
	time: string
	text: string
}

export function DirectMessageView({
	friend,
}: {
	friend: FriendRowData
}) {
	const messages: ChatLine[] = useMemo(
		() => [
			{ id: 'm1', author: friend.username, time: '11/5/2025 22:26', text: 'Yes vro it peak vro\n\nThe same thing the tv station does but made by me\nlol' },
			{ id: 'm2', author: 'Fair', time: '11/5/2025 22:27', text: 'are u the tv station\nkzStation' },
			{ id: 'm3', author: friend.username, time: '11/5/2025 22:27', text: 'yes vro kzStation' },
			{ id: 'm4', author: 'Fair', time: '11/5/2025 22:27', text: 'time for me to kzSleep' },
			{ id: 'm5', author: friend.username, time: '11/5/2025 22:27', text: 'kzNight vro' },
			{ id: 'm6', author: friend.username, time: '11/5/2025 22:27', text: 'nooo vro kzsleep is kzbad vro\nkzcode is better vro' }
		],
		[friend.username]
	)

	return (
		<div className={styles.root}>
			<div className={styles.body}>
				{messages.map((m) => (
					<div key={m.id} className={styles.msgGroup}>
						<Avatar imageUrl={null} size={40} />
						<div className={styles.msgContent}>
							<div className={styles.meta}>
								<div className={styles.author}>{m.author}</div>
								<div className={styles.time}>{m.time}</div>
							</div>
							<div className={styles.text}>{m.text}</div>
						</div>
					</div>
				))}
			</div>

			<div className={styles.composerWrap}>
				<div className={styles.composer}>
					<div className={styles.composerLeft}>
						<IconButton ariaLabel="Add attachment" size="sm">
							<PlusCircleIcon />
						</IconButton>
					</div>
					<input className={styles.input} placeholder={`Message @${friend.username}`} />
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


