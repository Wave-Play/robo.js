import type { ReactNode } from 'react'
import type { FriendRowData } from './friends.data'
import { FRIENDS } from './friends.data'
import { Avatar, IconButton, SearchInput } from '../ui'
import styles from './FriendsSidebar.module.css'

function FriendsIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M16 11a4 4 0 1 0-3.999-4A4 4 0 0 0 16 11Zm-8 0a3 3 0 1 0-3-3a3 3 0 0 0 3 3Zm8 2c-3.314 0-6 1.686-6 4v1h12v-1c0-2.314-2.686-4-6-4Zm-8 .5c-.948 0-1.822.186-2.53.504C4.036 14.576 3 15.52 3 16.7V18h6v-.7c0-1.51.741-2.783 1.96-3.634A8.984 8.984 0 0 0 8 13.5Z" />
		</svg>
	)
}

function NitroIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 2 8.5 8.5 2 12l6.5 3.5L12 22l3.5-6.5L22 12l-6.5-3.5L12 2Z" />
		</svg>
	)
}

function ShopIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M7 4h10l1 4H6l1-4Zm-2 6h14v10H5V10Zm3 2v6h2v-6H8Zm6 0v6h2v-6h-2Z" />
		</svg>
	)
}

function QuestsIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M7 2h10v4h3v16H4V6h3V2Zm2 4h6V4H9v2Zm-3 4h12v2H6v-2Zm0 4h12v2H6v-2Z" />
		</svg>
	)
}

function PlusIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M19 11H13V5h-2v6H5v2h6v6h2v-6h6z" />
		</svg>
	)
}

function NavItem({
	icon,
	label,
	selected,
	badge,
	onClick
}: {
	icon: ReactNode
	label: string
	selected?: boolean
	badge?: string
	onClick?: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={['interactive-item', styles.navItem, selected ? styles.selected : ''].filter(Boolean).join(' ')}
		>
			<span className={styles.navIcon}>{icon}</span>
			<span className={styles.navText}>{label}</span>
			{badge && <span className={styles.navBadge}>{badge}</span>}
		</button>
	)
}

function CloseIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M18 6.41L16.59 5 12 9.59 7.41 5 6 6.41 10.59 11 6 15.59 7.41 17 12 12.41 16.59 17 18 15.59 13.41 11z" />
		</svg>
	)
}

function DmRow({
	friend,
	selected,
	onOpen,
	onClose
}: {
	friend: FriendRowData
	selected: boolean
	onOpen: () => void
	onClose: () => void
}) {
	const subtitle = friend.subtitle?.trim()

	return (
		<button
			type="button"
			className={[styles.dmItem, 'interactive-item', selected ? styles.dmSelected : ''].filter(Boolean).join(' ')}
			onClick={onOpen}
		>
			<div className={styles.dmAvatar}>
				<Avatar
					imageUrl={friend.avatar}
					size={32}
					showStatus
					statusBorderColor="var(--sidebar-left-background)"
					statusColor={`var(--status-${friend.status ?? 'online'})`}
				/>
			</div>
			<div className={styles.dmText}>
				<div className={styles.dmName}>{friend.username}</div>
				{subtitle ? <div className={styles.dmSub}>{subtitle}</div> : null}
			</div>
			{selected && (
				<button
					type="button"
					className={[styles.dmClose, 'icon-button'].join(' ')}
					aria-label={`Close DM ${friend.username}`}
					title="Close"
					onClick={(e) => {
						e.stopPropagation()
						onClose()
					}}
				>
					<CloseIcon />
				</button>
			)}
		</button>
	)
}

export function FriendsSidebar({ openFriend, onOpenFriend }: { openFriend: FriendRowData | null; onOpenFriend: (friend: FriendRowData | null) => void }) {
	return (
		<div>
			<div className={styles.topSearch}>
				<SearchInput placeholder="Find or start a conversation" className={styles.topSearchInput} />
			</div>

			<nav className={styles.nav} aria-label="Primary">
				<NavItem icon={<FriendsIcon />} label="Friends" selected={!openFriend} onClick={() => onOpenFriend(null)} />
				<NavItem icon={<NitroIcon />} label="Nitro Home" />
				<NavItem icon={<ShopIcon />} label="Shop" />
				<NavItem icon={<QuestsIcon />} label="Quests" />
			</nav>

			<div className={styles.sectionHeader}>
				<span>Direct Messages</span>
				<IconButton ariaLabel="Create DM" title="Create DM" size="sm">
					<PlusIcon />
				</IconButton>
			</div>

			<div className={styles.dmList} aria-label="Direct Messages">
				{FRIENDS.map((friend) => (
					<DmRow
						key={friend.id}
						friend={friend}
						selected={openFriend?.id === friend.id}
						onOpen={() => onOpenFriend(friend)}
						onClose={() => onOpenFriend(null)}
					/>
				))}
			</div>
		</div>
	)
}


