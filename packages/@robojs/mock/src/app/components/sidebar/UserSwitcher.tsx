import { useEffect, useRef } from 'react'
import type { StageUser } from '../../types/stage'
import styles from './UserSwitcher.module.css'

interface UserSwitcherProps {
	currentUser: StageUser
	users: StageUser[]
	onSelect: (userId: string) => Promise<void>
	onClose: () => void
}

export function UserSwitcher({ currentUser, users, onSelect, onClose }: UserSwitcherProps) {
	const containerRef = useRef<HTMLDivElement>(null)

	// Close on click outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				onClose()
			}
		}
		// Add a small delay to prevent immediate close when opening
		const timeout = setTimeout(() => {
			document.addEventListener('click', handleClickOutside)
		}, 100)
		return () => {
			clearTimeout(timeout)
			document.removeEventListener('click', handleClickOutside)
		}
	}, [onClose])

	// Close on escape key
	useEffect(() => {
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', handleEsc)
		return () => window.removeEventListener('keydown', handleEsc)
	}, [onClose])

	return (
		<div className={styles.container} ref={containerRef}>
			<div className={styles.header}>
				<span className={styles.title}>Switch Account</span>
			</div>

			<div className={styles.userList}>
				{users.length === 0 ? (
					<div className={styles.empty}>No other users available</div>
				) : (
					users.map((user) => (
						<button
							key={user.id}
							className={`${styles.userItem} ${user.id === currentUser.id ? styles.current : ''}`}
							onClick={() => onSelect(user.id)}
							disabled={user.id === currentUser.id}
						>
							<div className={styles.avatar}>
								{user.avatar ? (
									<img src={getAvatarUrl(user)} alt="" />
								) : (
									<DefaultAvatar />
								)}
								<span className={`${styles.status} ${styles[user.status || 'online']}`} />
							</div>
							<div className={styles.userInfo}>
								<span className={styles.username}>{user.username}</span>
								{user.id === currentUser.id && (
									<span className={styles.currentLabel}>Current</span>
								)}
							</div>
							{user.id === currentUser.id && (
								<CheckIcon />
							)}
						</button>
					))
				)}
			</div>
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

function CheckIcon() {
	return (
		<svg className={styles.checkIcon} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
		</svg>
	)
}
