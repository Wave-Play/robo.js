import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { StageMember, StageRole } from '../../types/stage'
import { getAvatarUrl } from '../../utils/avatar'
import { PrimaryButton } from '../base'
import { EmojiPicker, EMOJI_PICKER_WIDTH, EMOJI_PICKER_HEIGHT } from '../common/EmojiPicker'
import styles from './UserProfilePopout.module.css'

const POPOUT_WIDTH = 340
const MARGIN = 8

interface UserProfilePopoutProps {
	member: StageMember
	roles: StageRole[]
	currentUserId?: string
	botUserId?: string
	hasSlashCommands: boolean
	anchorTop: number
	listLeft: number
	side?: 'left' | 'right'
	onClose: () => void
	onMessage: (userId: string) => void
}

export function UserProfilePopout({
	member,
	roles,
	currentUserId,
	hasSlashCommands,
	anchorTop,
	listLeft,
	side = 'left',
	onClose,
	onMessage
}: UserProfilePopoutProps) {
	const popoutRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const emojiBtnRef = useRef<HTMLButtonElement>(null)
	const { user, nick } = member
	const displayName = nick || user.username
	const status = user.status || 'online'
	const [top, setTop] = useState(anchorTop)
	const [messageText, setMessageText] = useState('')
	const [showEmojiPicker, setShowEmojiPicker] = useState(false)

	const isSelf = currentUserId === user.id
	const isBot = !!user.bot

	// Get member's roles (excluding @everyone)
	const memberRoles = roles
		.filter((r) => member.roles.includes(r.id) && r.name !== '@everyone')
		.sort((a, b) => b.position - a.position)

	// Clamp vertical position so the popout stays within the viewport
	useLayoutEffect(() => {
		if (!popoutRef.current) return
		const popoutHeight = popoutRef.current.offsetHeight
		const maxTop = window.innerHeight - popoutHeight - MARGIN
		setTop(Math.max(MARGIN, Math.min(anchorTop, maxTop)))
	}, [anchorTop])

	// Close on click outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node
			// If the target was removed from the DOM (e.g. emoji picker overlay unmounted),
			// don't treat it as an outside click
			if (!document.contains(target)) return
			if (popoutRef.current && !popoutRef.current.contains(target)) {
				onClose()
			}
		}

		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside)
		}, 0)

		return () => {
			clearTimeout(timer)
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [onClose])

	// Close on Escape
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				if (showEmojiPicker) {
					setShowEmojiPicker(false)
				} else {
					onClose()
				}
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [onClose, showEmojiPicker])

	const handleSendMessage = useCallback(() => {
		onMessage(user.id)
		onClose()
	}, [user.id, onMessage, onClose])

	const handleEmojiSelect = useCallback(
		(emoji: string) => {
			setMessageText((prev) => prev + emoji)
			setShowEmojiPicker(false)
			inputRef.current?.focus()
		},
		[]
	)

	// Compute emoji picker position anchored above the emoji button
	const getEmojiPickerPosition = useCallback(() => {
		if (!emojiBtnRef.current) return undefined
		const rect = emojiBtnRef.current.getBoundingClientRect()
		return {
			x: rect.right - EMOJI_PICKER_WIDTH,
			y: rect.top - EMOJI_PICKER_HEIGHT - 8
		}
	}, [])

	// Position: to the left or right of the anchor list
	const left = side === 'right' ? listLeft + MARGIN : listLeft - POPOUT_WIDTH - MARGIN

	// Banner color: bots get green, default is brand gradient
	const bannerStyle = isBot
		? { background: 'linear-gradient(135deg, #57f287 0%, #248045 100%)' }
		: undefined

	return (
		<div
			ref={popoutRef}
			className={styles.popout}
			style={{ top, left }}
			role="dialog"
			aria-label="User profile"
		>
			{/* Banner */}
			<div className={styles.banner} style={bannerStyle} />

			{/* Avatar */}
			<div className={styles.avatarContainer}>
				<div className={styles.avatar}>
					<img
						src={getAvatarUrl(user.id, user.avatar ?? null, 80)}
						alt=""
						className={styles.avatarImage}
						onError={(e) => {
							const target = e.target as HTMLImageElement
							target.src = getAvatarUrl(user.id, null, 80)
						}}
					/>
					<span className={`${styles.statusDot} ${styles[status]}`} />
				</div>
			</div>

			{/* User info */}
			<div className={styles.content}>
				{/* Display name + bot tag */}
				<h2 className={styles.displayName}>
					{displayName}
					{isBot && <span className={styles.appTag}>APP</span>}
				</h2>

				{/* Username line + slash command icon for bots */}
				<p className={styles.username}>
					{user.username}
					{user.discriminator && user.discriminator !== '0' && `#${user.discriminator}`}
					{isBot && hasSlashCommands && (
						<span className={styles.slashCommandBadge} title="Has slash commands">
							{'{/}'}
						</span>
					)}
				</p>

				{/* Add App button for bots */}
				{isBot && (
					<button className={styles.addAppButton} type="button">
						+ Add App
					</button>
				)}

				{/* Roles section */}
				{memberRoles.length > 0 && (
					<div className={styles.rolesSection}>
						<h3 className={styles.rolesTitle}>Roles</h3>
						<div className={styles.roles}>
							{memberRoles.map((role) => (
								<RolePill key={role.id} role={role} />
							))}
							<button className={styles.addRoleButton} type="button" title="Add role">
								<PlusIcon />
							</button>
						</div>
					</div>
				)}

				{/* Add role (when no roles) */}
				{memberRoles.length === 0 && (
					<button className={styles.addRoleLink} type="button">
						+ Add role
					</button>
				)}

				{/* Footer action */}
				<div className={styles.footer}>
					{isSelf ? (
						<PrimaryButton fullWidth>
							<PencilIcon />
							Edit Profile
						</PrimaryButton>
					) : (
						<div className={styles.messageInputWrapper}>
							<input
								ref={inputRef}
								className={styles.messageInput}
								type="text"
								placeholder={`Message @${displayName}`}
								value={messageText}
								onChange={(e) => setMessageText(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && messageText.trim()) {
										handleSendMessage()
									}
								}}
							/>
							<button
								ref={emojiBtnRef}
								className={styles.emojiButton}
								type="button"
								title="Emoji"
								onClick={() => setShowEmojiPicker((prev) => !prev)}
							>
								<EmojiIcon />
							</button>
							{showEmojiPicker && (
								<EmojiPicker
									onSelect={handleEmojiSelect}
									onClose={() => setShowEmojiPicker(false)}
									position={getEmojiPickerPosition()}
								/>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

function RolePill({ role }: { role: StageRole }) {
	const dotColor = role.color !== 0 ? `#${role.color.toString(16).padStart(6, '0')}` : 'var(--text-muted)'

	return (
		<div className={styles.rolePill}>
			<span className={styles.roleDot} style={{ backgroundColor: dotColor }} />
			<span className={styles.roleName}>{role.name}</span>
			<button className={styles.roleRemoveButton} type="button" title={`Remove ${role.name}`}>
				<CloseIcon />
			</button>
		</div>
	)
}

function PencilIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M16.293 2.293a1 1 0 0 1 1.414 0l4 4a1 1 0 0 1 0 1.414l-13 13A1 1 0 0 1 8 21H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 .293-.707l13-13ZM5 16.414V19h2.586l12-12L17 4.414l-12 12Z" />
		</svg>
	)
}

function EmojiIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" opacity={0.5}>
			<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
			<circle cx="8.5" cy="10" r="1.25" />
			<circle cx="15.5" cy="10" r="1.25" />
			<path d="M8 14.5c0 0 1.5 2.5 4 2.5s4-2.5 4-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	)
}

function CloseIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
			<path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
		</svg>
	)
}

function PlusIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M13 5a1 1 0 1 0-2 0v6H5a1 1 0 1 0 0 2h6v6a1 1 0 1 0 2 0v-6h6a1 1 0 1 0 0-2h-6V5Z" />
		</svg>
	)
}
