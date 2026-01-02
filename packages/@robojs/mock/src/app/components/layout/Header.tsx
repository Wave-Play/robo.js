import { useRef, useEffect } from 'react'
import type { StageChannel } from '../../types/stage'
import MagnifyingGlass from '../icons/magnifying_glass'
import ThreadIcon from '../icons/thread'
import NotificationIcon from '../icons/notification'
import PinIcon from '../icons/pin'
import { NotificationDropdown } from '../notifications/NotificationDropdown'
import { PinnedMessagesDropdown } from '../pinned/PinnedMessagesDropdown'
import styles from './Header.module.css'

interface HeaderProps {
	channel: StageChannel | null
	onToggleMembers: () => void
	showMembers: boolean
	onToggleThreads: () => void
	showThreads: boolean
	onToggleNotifications: () => void
	showNotifications: boolean
	onTogglePinnedMessages: () => void
	showPinnedMessages: boolean
	onMobileMenuToggle?: () => void
	isMobileSidebarOpen?: boolean
}

export function Header({
	channel,
	onToggleMembers,
	showMembers,
	onToggleThreads,
	showThreads,
	onToggleNotifications,
	showNotifications,
	onTogglePinnedMessages,
	showPinnedMessages,
	onMobileMenuToggle,
	isMobileSidebarOpen
}: HeaderProps) {
	const notificationsRef = useRef<HTMLDivElement>(null)
	const pinnedRef = useRef<HTMLDivElement>(null)
	const ChannelIcon = channel ? getChannelIcon(channel.type) : null

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (showNotifications && notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
				onToggleNotifications()
			}
			if (showPinnedMessages && pinnedRef.current && !pinnedRef.current.contains(event.target as Node)) {
				onTogglePinnedMessages()
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [showNotifications, showPinnedMessages, onToggleNotifications, onTogglePinnedMessages])

	return (
		<header className={styles.header}>
			{/* Mobile hamburger menu */}
			{onMobileMenuToggle && (
				<button
					className={`${styles.mobileMenuButton} ${isMobileSidebarOpen ? styles.active : ''}`}
					onClick={onMobileMenuToggle}
					aria-label={isMobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
					aria-expanded={isMobileSidebarOpen}
				>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
						{isMobileSidebarOpen ? (
							<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
						) : (
							<path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
						)}
					</svg>
				</button>
			)}

			<div className={styles.channelInfo}>
				{channel ? (
					<>
						{ChannelIcon ? <ChannelIcon className={styles.channelIcon} /> : <span className={styles.hash}>#</span>}
						<h2 className={styles.channelName}>{channel.name}</h2>
						{channel.topic && (
							<>
								<div className={styles.divider} />
								<span className={styles.topic}>{channel.topic}</span>
							</>
						)}
					</>
				) : (
					<span className={styles.placeholder}>Select a channel</span>
				)}
			</div>

			<div className={styles.actions}>
				<button
					className={`${styles.iconButton} ${showMembers ? styles.active : ''}`}
					onClick={onToggleMembers}
					title="Toggle member list"
					aria-label={showMembers ? 'Hide member list' : 'Show member list'}
					aria-pressed={showMembers}
				>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
						<path d="M14 8.00598C14 10.211 12.206 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.794 4.00598 10 4.00598C12.206 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.473 5.29 13.006 10 13.006C14.711 13.006 18 15.473 18 19.006V20.006H2V19.006ZM20 20.006H22V19.006C22 16.4919 20.2085 14.4617 17.4491 13.4466C19.0315 14.5771 20 16.5103 20 19.006V20.006ZM14 3.99902C15.5 4.5 17 6 16.9999 8.00598C17 10 15.5 11.5 14 11.999C14.6254 11.0792 15 9.93913 15 8.00598C15 6.07283 14.6254 4.91882 14 3.99902Z" />
					</svg>
				</button>
				<div className={styles.actions}>
					<button
						className={`${styles.iconButton} ${showThreads ? styles.active : ''}`}
						onClick={onToggleThreads}
						title="Toggle threads"
						aria-label={showThreads ? 'Hide Threads' : 'Show Threads'}
						aria-pressed={showThreads}
					>
						<ThreadIcon width={24} height={24} />
					</button>
					<div className={styles.dropdownWrapper} ref={notificationsRef}>
						<button
							className={`${styles.iconButton} ${showNotifications ? styles.active : ''}`}
							onClick={onToggleNotifications}
							title="Notifications"
							aria-label={showNotifications ? 'Hide notifications' : 'Show notifications'}
							aria-pressed={showNotifications}
						>
							<NotificationIcon width={24} height={24} />
						</button>
						{showNotifications && <NotificationDropdown onClose={onToggleNotifications} />}
					</div>
					<div className={styles.dropdownWrapper} ref={pinnedRef}>
						<button
							className={`${styles.iconButton} ${showPinnedMessages ? styles.active : ''}`}
							onClick={onTogglePinnedMessages}
							title="Pinned messages"
							aria-label={showPinnedMessages ? 'Hide pinned messages' : 'Show pinned messages'}
							aria-pressed={showPinnedMessages}
						>
							<PinIcon width={24} height={24} />
						</button>
						{showPinnedMessages && <PinnedMessagesDropdown onClose={onTogglePinnedMessages} />}
					</div>
				</div>
				<div className={styles.inputContainer}>
					<input className={styles.headerInput} placeholder="search"></input>
					<div className={styles.headerInputIcon}>
						<MagnifyingGlass width={15} height={15} fill="#aaaab0" />
					</div>
				</div>
			</div>
		</header>
	)
}

const ChannelType = {
	GUILD_TEXT: 0,
	GUILD_VOICE: 2,
	GUILD_CATEGORY: 4,
	GUILD_ANNOUNCEMENT: 5,
	ANNOUNCEMENT_THREAD: 10,
	PUBLIC_THREAD: 11,
	PRIVATE_THREAD: 12,
	GUILD_STAGE_VOICE: 13,
	GUILD_FORUM: 15,
	GUILD_MEDIA: 16
} as const

function getChannelIcon(type: number) {
	switch (type) {
		case ChannelType.GUILD_VOICE:
		case ChannelType.GUILD_STAGE_VOICE:
			return VoiceIcon
		case ChannelType.GUILD_FORUM:
		case ChannelType.GUILD_MEDIA:
			return ForumIcon
		case ChannelType.PUBLIC_THREAD:
		case ChannelType.PRIVATE_THREAD:
		case ChannelType.ANNOUNCEMENT_THREAD:
			return ThreadIconSmall
		default:
			return null
	}
}

function VoiceIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 3C10.34 3 9 4.37 9 6.07V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V6.07C15 4.37 13.66 3 12 3ZM5.5 11C5.5 14.53 8.36 17.38 11.75 17.89V21H12.25V17.89C15.64 17.38 18.5 14.53 18.5 11H17C17 14.03 14.54 16.5 11.88 16.5C9.21 16.5 7 14.03 7 11H5.5Z" />
		</svg>
	)
}

function ForumIcon({ className }: { className?: string }) {
	return (
		<svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M18.91 12.98C18.91 11.23 17.64 9.78 16 9.36V8C16 6.9 15.1 6 14 6H10C8.9 6 8 6.9 8 8V9.36C6.36 9.78 5.09 11.23 5.09 12.98C5.09 14.96 6.69 16.55 8.65 16.55H15.35C17.31 16.55 18.91 14.96 18.91 12.98ZM10 8H14V9.17H10V8ZM15.35 14.55H8.65C7.79 14.55 7.09 13.85 7.09 12.98C7.09 12.12 7.79 11.42 8.65 11.42H15.35C16.21 11.42 16.91 12.12 16.91 12.98C16.91 13.85 16.21 14.55 15.35 14.55Z" />
		</svg>
	)
}

function ThreadIconSmall({ className }: { className?: string }) {
	return (
		<svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M5.43309 21C5.35842 21 5.30189 20.9325 5.31494 20.859L5.99991 17H2.14274C2.06819 17 2.01168 16.9327 2.02453 16.8593L2.33253 15.0993C2.34232 15.0419 2.39234 15 2.45074 15H6.34991L7.40991 9H3.55274C3.47819 9 3.42168 8.93274 3.43453 8.85931L3.74253 7.09931C3.75232 7.04189 3.80234 7 3.86074 7H7.75991L8.45667 3.14103C8.46646 3.08361 8.51648 3.04172 8.57488 3.04172H10.3349C10.4095 3.04172 10.466 3.10917 10.4532 3.18269L9.75991 7H15.7599L16.4567 3.14103C16.4665 3.08361 16.5165 3.04172 16.5749 3.04172H18.3349C18.4095 3.04172 18.466 3.10917 18.4532 3.18269L17.7599 7H21.6171C21.6916 7 21.7482 7.06726 21.7353 7.14069L21.4273 8.90069C21.4175 8.95811 21.3675 9 21.3091 9H17.4099L17.0495 11.03H15.05L15.4104 9H9.41035L8.35035 15H10.35L10.0895 16.97H8.00001L7.30326 20.829C7.29346 20.8864 7.24344 20.9283 7.18505 20.9283H5.43309V21Z" />
		</svg>
	)
}
