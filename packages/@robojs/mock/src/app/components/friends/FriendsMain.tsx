import { useEffect, useState } from 'react'
import type { StageUser } from '../../types/stage'
import { SearchInput } from '../ui'
import { FriendsAllPanel } from './FriendsAllPanel'
import { FriendsOnlinePanel } from './FriendsOnlinePanel'
import { DirectMessageView } from './dm/DirectMessageView'
import styles from './FriendsMain.module.css'

function FriendsGlyph() {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M16 11a4 4 0 1 0-3.999-4A4 4 0 0 0 16 11Zm-8 0a3 3 0 1 0-3-3a3 3 0 0 0 3 3Zm8 2c-3.314 0-6 1.686-6 4v1h12v-1c0-2.314-2.686-4-6-4Zm-8 .5c-.948 0-1.822.186-2.53.504C4.036 14.576 3 15.52 3 16.7V18h6v-.7c0-1.51.741-2.783 1.96-3.634A8.984 8.984 0 0 0 8 13.5Z" />
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
	openUser,
	onOpenUser,
	dmChannelId,
	users,
}: {
	onTitleChange?: (title: string) => void
	openUser: StageUser | null
	onOpenUser: (user: StageUser | null) => void
	dmChannelId: string | null
	users: StageUser[]
}) {
	const [activeTab, setActiveTab] = useState<'online' | 'all'>('online')

	const onlineCount = users.filter((u) => u.status !== 'offline').length
	const sectionLabel = activeTab === 'all' ? `All — ${users.length}` : `Online — ${onlineCount}`

	useEffect(() => {
		if (openUser) {
			onTitleChange?.(openUser.username)
		} else {
			onTitleChange?.('Friends')
		}
	}, [openUser, onTitleChange])

	if (openUser && dmChannelId) {
		return <DirectMessageView user={openUser} channelId={dmChannelId} />
	}

	return (
		<div className={styles.content}>
			<header className={styles.header}>
				<div className={styles.friendsTitle}>
					<FriendsGlyph />
					<span style={{color: "white"}}>Friends</span>
				</div>
				<div className={styles.divider} />

				<div className={styles.tabs}>
					<div className={styles.tabRow} aria-label="Friends tabs">
						<Tab label="Online" selected={activeTab === 'online'} onClick={() => setActiveTab('online')} />
						<Tab label="All" selected={activeTab === 'all'} onClick={() => setActiveTab('all')} />
						<button className={styles.addFriend} type="button">
							Add Friend
						</button>
					</div>
				</div>
			</header>

			<div className={styles.searchWrap}>
				<SearchInput placeholder="Search" className={styles.searchInput} />
			</div>

			<div className={styles.sectionLabel}>{sectionLabel}</div>
			<div className={styles.list}>
				{activeTab === 'all' ? (
					<FriendsAllPanel users={users} onOpenUser={onOpenUser} />
				) : (
					<FriendsOnlinePanel users={users} onOpenUser={onOpenUser} />
				)}
			</div>
		</div>
	)
}
