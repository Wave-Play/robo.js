import { useEffect, useState } from 'react'
import { IconButton, SearchInput } from '../ui'
import { FriendsAllPanel } from './FriendsAllPanel'
import { FriendsOnlinePanel } from './FriendsOnlinePanel'
import type { FriendRowData } from './friends.data'
import { DirectMessageView } from './dm/DirectMessageView'
import styles from './FriendsMain.module.css'

function FriendsGlyph() {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M16 11a4 4 0 1 0-3.999-4A4 4 0 0 0 16 11Zm-8 0a3 3 0 1 0-3-3a3 3 0 0 0 3 3Zm8 2c-3.314 0-6 1.686-6 4v1h12v-1c0-2.314-2.686-4-6-4Zm-8 .5c-.948 0-1.822.186-2.53.504C4.036 14.576 3 15.52 3 16.7V18h6v-.7c0-1.51.741-2.783 1.96-3.634A8.984 8.984 0 0 0 8 13.5Z" />
		</svg>
	)
}

function InboxIcon() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.25"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
			<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
		</svg>
	)
}

function HelpIcon() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.25"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" />
			<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
			<path d="M12 17h.01" />
		</svg>
	)
}

function Tab({
	label,
	selected,
	onClick
}: {
	label: string
	selected?: boolean
	onClick?: () => void
}) {
	return (
		<button
			className={[styles.tab, selected ? styles.tabSelected : ''].filter(Boolean).join(' ')}
			type="button"
			aria-current={selected ? 'page' : undefined}
			onClick={onClick}
		>
			{label}
		</button>
	)
}

export function FriendsMain({
	onTitleChange,
	openFriend,
	onOpenFriend,
}: {
	onTitleChange?: (title: string) => void
	openFriend: FriendRowData | null
	onOpenFriend: (friend: FriendRowData | null) => void
}) {
	const [activeTab, setActiveTab] = useState<'online' | 'all'>('online')

	const sectionLabel = activeTab === 'all' ? 'All — 6' : 'Online — 6'

	useEffect(() => {
		if (openFriend) {
			onTitleChange?.(openFriend.username)
		} else {
			onTitleChange?.('Friends')
		}
	}, [openFriend, onTitleChange])

	if (openFriend) {
		return <DirectMessageView friend={openFriend} />
	}

	return (
		<div className={styles.content}>
			<header className={styles.header}>
				<div className={styles.friendsTitle}>
					<FriendsGlyph />
					<span>Friends</span>
				</div>
				<div className={styles.divider} />

				<div className={styles.tabs}>
					<div className={styles.tabRow} aria-label="Friends tabs">
						<Tab label="Online" selected={activeTab === 'online'} onClick={() => setActiveTab('online')} />
						<Tab label="All" selected={activeTab === 'all'} onClick={() => setActiveTab('all')} />
						<Tab label="Pending" />
						<Tab label="Blocked" />
						<button className={styles.addFriend} type="button">
							Add Friend
						</button>
					</div>
				</div>

				<div className={styles.topRight}>
					<IconButton ariaLabel="Inbox" size="sm">
						<InboxIcon />
					</IconButton>
					<IconButton ariaLabel="Help" size="sm">
						<HelpIcon />
					</IconButton>
				</div>
			</header>

			<div className={styles.searchWrap}>
				<SearchInput placeholder="Search" />
			</div>

			<div className={styles.sectionLabel}>{sectionLabel}</div>
			<div className={styles.list}>
				{activeTab === 'all' ? (
					<FriendsAllPanel onOpenFriend={onOpenFriend} />
				) : (
					<FriendsOnlinePanel onOpenFriend={onOpenFriend} />
				)}
			</div>
		</div>
	)
}


