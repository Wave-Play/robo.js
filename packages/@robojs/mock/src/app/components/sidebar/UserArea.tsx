import { useEffect, useRef, useState } from 'react'
import type { StageUser } from '../../types/stage'
import { DropdownContainer, ListItem, ListItemHeader } from '../base'
import styles from './UserArea.module.css'

interface UserAreaProps {
	user: StageUser | null
	availableUsers?: StageUser[]
}

export function UserArea({ user, availableUsers = [] }: UserAreaProps) {
	const [showSwitcher, setShowSwitcher] = useState(false)
	const wrapperRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!showSwitcher) return

		const handleClick = (event: MouseEvent) => {
			if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
				setShowSwitcher(false)
			}
		}

		const handleKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setShowSwitcher(false)
			}
		}

		document.addEventListener('mousedown', handleClick)
		document.addEventListener('keydown', handleKey)

		return () => {
			document.removeEventListener('mousedown', handleClick)
			document.removeEventListener('keydown', handleKey)
		}
	}, [showSwitcher])

	if (!user) {
		return (
			<div className={styles.container}>
				<div className={styles.placeholder}>Not connected</div>
			</div>
		)
	}

	const status = user.status || 'online'
	const accounts = [user, ...availableUsers].filter((account, index, list) => {
		if (!account) return false
		return list.findIndex((item) => item?.id === account.id) === index
	})

	return (
		<div className={styles.container} ref={wrapperRef}>
			<div className={styles.avatarWrapper}>
				{user.avatar ? (
					<img
						className={styles.avatar}
						src={getAvatarUrl(user)}
						alt={user.username}
					/>
				) : (
					<div className={styles.avatar}>
						<DefaultAvatar />
					</div>
				)}
				<div className={`${styles.status} ${styles[status]}`} />
			</div>

			<div className={styles.info}>
				<span className={styles.username}>{user.username}</span>
				{user.discriminator && user.discriminator !== '0' && (
					<span className={styles.discriminator}>#{user.discriminator}</span>
				)}
			</div>

			<div className={styles.buttons}>
				<button
					className={styles.switchButton}
					title="Switch accounts"
					onClick={() => setShowSwitcher((prev) => !prev)}
					aria-expanded={showSwitcher}
					aria-haspopup="dialog"
					type="button"
				>
					<ChevronIcon />
				</button>
				<button className={styles.iconButton} title="Settings">
					<SettingsIcon />
				</button>
			</div>
			{showSwitcher && (
				<DropdownContainer className={styles.switcher} placement="top-start" role="dialog" aria-label="Account switcher">
					<ListItemHeader className={styles.switcherHeader}>Switch Accounts</ListItemHeader>
					<div className={styles.switcherList}>
						{accounts.map((account) => (
							<ListItem
								key={account.id}
								label={account.username}
								description={account.status ? account.status : 'offline'}
								isSelected={account.id === user.id}
								icon={
									<div className={styles.switcherAvatar}>
										{account.avatar ? (
											<img src={getAvatarUrl(account)} alt="" />
										) : (
											<DefaultAvatar />
										)}
									</div>
								}
								rightContent={account.id === user.id ? <span className={styles.activeBadge}>Active</span> : null}
							/>
						))}
						<ListItem label="Manage Accounts" description="Add or remove logins" icon={<ManageIcon />} />
					</div>
				</DropdownContainer>
			)}
		</div>
	)
}

function getAvatarUrl(user: StageUser): string {
	if (user.avatar?.startsWith('http') || user.avatar?.startsWith('data:')) {
		return user.avatar
	}
	return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`
}

function DefaultAvatar() {
	return (
		<svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
			<rect width="32" height="32" rx="16" fill="var(--brand-primary)" />
			<path
				d="M16 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-8 18c0-4.42 3.58-8 8-8s8 3.58 8 8"
				fill="white"
				opacity="0.8"
			/>
		</svg>
	)
}

function SettingsIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
		</svg>
	)
}

function ChevronIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
			<path d="M7 10l5 5 5-5H7z" />
		</svg>
	)
}

function ManageIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2a5 5 0 1 0 0 10a5 5 0 0 0 0-10zm0 12c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z" />
		</svg>
	)
}
