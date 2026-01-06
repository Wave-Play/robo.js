import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import type { StageActivity, StageUser } from '../../types/stage'
import { DropdownContainer, ListItem, ListItemSeparator } from '../base'
import { getAvatarUrl } from '../../utils/avatar'
import { StatusEditorModal } from './StatusEditorModal'
import styles from './UserProfilePopout.module.css'

interface UserProfilePopoutProps {
	user: StageUser
	availableUsers?: StageUser[]
	onClose?: () => void
	callState?: {
		title?: string
		name?: string
		actionLabel?: string
		participants?: StageUser[]
		participantCount?: number
	}
}

type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline'

const presenceOptions: Array<{
	value: PresenceStatus
	label: string
	description?: string
	hasDurationMenu?: boolean
}> = [
	{ value: 'online', label: 'Online' },
	{ value: 'idle', label: 'Idle', hasDurationMenu: true },
	{
		value: 'dnd',
		label: 'Do Not Disturb',
		description: 'You will not receive desktop notifications',
		hasDurationMenu: true
	},
	{
		value: 'offline',
		label: 'Invisible',
		description: 'You will appear offline',
		hasDurationMenu: true
	}
]

const presenceDurations: Array<{ label: string; durationMs: number | null }> = [
	{ label: 'For 15 Minutes', durationMs: 15 * 60 * 1000 },
	{ label: 'For 1 Hour', durationMs: 60 * 60 * 1000 },
	{ label: 'For 8 Hours', durationMs: 8 * 60 * 60 * 1000 },
	{ label: 'For 24 Hours', durationMs: 24 * 60 * 60 * 1000 },
	{ label: 'For 3 Days', durationMs: 3 * 24 * 60 * 60 * 1000 },
	{ label: 'Forever', durationMs: null }
]

export function UserProfilePopout({ user, availableUsers = [], onClose, callState }: UserProfilePopoutProps) {
	const [showSwitchMenu, setShowSwitchMenu] = useState(false)
	const [switchPanelTop, setSwitchPanelTop] = useState<number | null>(null)
	const [switchPanelSide, setSwitchPanelSide] = useState<'right' | 'left'>('right')
	const [showPresenceMenu, setShowPresenceMenu] = useState(false)
	const [presencePanelTop, setPresencePanelTop] = useState<number | null>(null)
	const [presencePanelSide, setPresencePanelSide] = useState<'right' | 'left'>('right')
	const [showPresenceDurationMenu, setShowPresenceDurationMenu] = useState(false)
	const [presenceDurationFor, setPresenceDurationFor] = useState<PresenceStatus | null>(null)
	const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)
	const switchRowRef = useRef<HTMLDivElement>(null)
	const switchPanelRef = useRef<HTMLDivElement>(null)
	const switchItemRef = useRef<HTMLDivElement>(null)
	const presenceRowRef = useRef<HTMLDivElement>(null)
	const presencePanelRef = useRef<HTMLDivElement>(null)
	const presenceTimeoutRef = useRef<number | null>(null)
	const { updateUser } = useCurrentUser()

	const accounts = useMemo(() => {
		const list = [user, ...availableUsers].filter(Boolean)
		return list.filter((account, index, all) => all.findIndex((item) => item.id === account.id) === index)
	}, [user, availableUsers])

	const status = (user.status || 'online') as PresenceStatus
	const displayName = user.global_name ?? user.username
	const handle = formatHandle(user)
	const pronouns = 'she/her'
	const presenceLabel = formatPresenceLabel(status)
	const statusPlaceholder = 'What have you been listening to?'
	const customStatus = user.activities?.find((activity) => activity.type === 4 && activity.state)?.state?.trim()
	const hasCustomStatus = Boolean(customStatus)
	const activityPool = user.activities?.filter((activity) => activity.type !== 4) ?? []
	const displayActivities = activityPool.slice(0, 3)
	const primaryActivity = activityPool[0]
	const activityText = formatActivity(primaryActivity)
	const statusBubbleText = hasCustomStatus ? customStatus ?? '' : statusPlaceholder
	const aboutText = primaryActivity?.state ?? activityText ?? 'You are the best thing that happened to me <3'
	const callParticipants =
		callState && callState.participants?.length ? callState.participants : callState ? [user] : []
	const callParticipantCount = callState?.participantCount ?? callParticipants.length
	const visibleParticipants = callParticipants.slice(0, 2)
	const overflowCount = Math.max(0, callParticipantCount - visibleParticipants.length)
	const callTitle = callState?.title ?? 'In a call'
	const callName = callState?.name ?? 'Voice Channel'
	const callActionLabel = callState?.actionLabel ?? 'Open Call'

	useLayoutEffect(() => {
		if (!showSwitchMenu) return
		if (!containerRef.current || !switchRowRef.current) return

		const containerRect = containerRef.current.getBoundingClientRect()
		const switchRect = switchRowRef.current.getBoundingClientRect()
		setSwitchPanelTop(switchRect.top - containerRect.top)

		if (switchPanelRef.current) {
			const panelRect = switchPanelRef.current.getBoundingClientRect()
			const shouldFlip = containerRect.right + panelRect.width + 8 > window.innerWidth
			setSwitchPanelSide(shouldFlip ? 'left' : 'right')
		}
	}, [showSwitchMenu])

	useLayoutEffect(() => {
		if (!showPresenceMenu) return
		if (!containerRef.current || !presenceRowRef.current) return

		const containerRect = containerRef.current.getBoundingClientRect()
		const presenceRect = presenceRowRef.current.getBoundingClientRect()
		setPresencePanelTop(presenceRect.top - containerRect.top)

		if (presencePanelRef.current) {
			const panelRect = presencePanelRef.current.getBoundingClientRect()
			const shouldFlip = containerRect.right + panelRect.width + 8 > window.innerWidth
			setPresencePanelSide(shouldFlip ? 'left' : 'right')
		}
	}, [showPresenceMenu, showPresenceDurationMenu])

	useEffect(() => {
		return () => {
			if (presenceTimeoutRef.current) {
				window.clearTimeout(presenceTimeoutRef.current)
			}
		}
	}, [])

	const focusFirstSwitchItem = () => {
		const firstItem = switchPanelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
		firstItem?.focus()
	}

	const handleSwitchToggle = () => {
		setShowSwitchMenu((prev) => !prev)
	}

	const handleSwitchKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'ArrowRight') {
			event.preventDefault()
			if (!showSwitchMenu) {
				setShowSwitchMenu(true)
				requestAnimationFrame(() => focusFirstSwitchItem())
			} else {
				focusFirstSwitchItem()
			}
		}

		if (event.key === 'ArrowLeft' && showSwitchMenu) {
			event.preventDefault()
			setShowSwitchMenu(false)
			switchItemRef.current?.focus()
		}
	}

	const handleSwitchPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'ArrowLeft') {
			event.preventDefault()
			setShowSwitchMenu(false)
			switchItemRef.current?.focus()
		}
	}

	const handlePresenceToggle = () => {
		setShowPresenceMenu((prev) => {
			if (prev) {
				setShowPresenceDurationMenu(false)
				setPresenceDurationFor(null)
			}
			return !prev
		})
	}

	const handlePresenceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'ArrowRight') {
			event.preventDefault()
			setShowPresenceMenu(true)
		}

		if (event.key === 'ArrowLeft' && showPresenceMenu) {
			event.preventDefault()
			setShowPresenceMenu(false)
			setShowPresenceDurationMenu(false)
			setPresenceDurationFor(null)
		}
	}

	const clearPresenceTimer = () => {
		if (presenceTimeoutRef.current) {
			window.clearTimeout(presenceTimeoutRef.current)
			presenceTimeoutRef.current = null
		}
	}

	const handlePresenceSelect = async (nextStatus: PresenceStatus, durationMs: number | null = null) => {
		clearPresenceTimer()
		try {
			await updateUser({ status: nextStatus })
		} catch (error) {
			console.error('[UserProfilePopout] Failed to update presence', error)
		}

		if (durationMs) {
			presenceTimeoutRef.current = window.setTimeout(() => {
				updateUser({ status: 'online' }).catch((error) => {
					console.error('[UserProfilePopout] Failed to reset presence', error)
				})
			}, durationMs)
		}

		setShowPresenceMenu(false)
		setShowPresenceDurationMenu(false)
		setPresenceDurationFor(null)
	}

	const handlePresenceDurationSelect = (durationMs: number | null) => {
		if (!presenceDurationFor) return
		handlePresenceSelect(presenceDurationFor, durationMs)
	}

	const handleEditStatus = () => {
		setIsStatusModalOpen(true)
	}

	const handleClearStatus = async () => {
		if (!hasCustomStatus) return
		try {
			await updateUser({ activities: activityPool })
		} catch (error) {
			console.error('[UserProfilePopout] Failed to clear status', error)
		}
	}

	const handleSaveStatus = async (nextStatus: string) => {
		const trimmed = nextStatus.trim()
		const nextActivities = trimmed
			? [
					...activityPool,
					{
						name: 'Custom Status',
						type: 4,
						state: trimmed
					}
				]
			: activityPool

		try {
			await updateUser({ activities: nextActivities })
			setIsStatusModalOpen(false)
		} catch (error) {
			console.error('[UserProfilePopout] Failed to update status', error)
		}
	}

	return (
		<>
			<DropdownContainer
				ref={containerRef}
				placement="top-start"
				className={styles.container}
				role="dialog"
				aria-label="User profile"
			>
			<div
				className={styles.mainPanel}
				onMouseLeave={(event) => {
					const nextTarget = event.relatedTarget as Node | null
					if (
						nextTarget &&
						(switchPanelRef.current?.contains(nextTarget) ||
							presencePanelRef.current?.contains(nextTarget))
					) {
						return
					}
					setShowSwitchMenu(false)
					setShowPresenceMenu(false)
					setShowPresenceDurationMenu(false)
					setPresenceDurationFor(null)
				}}
			>
				<div className={styles.banner} />

				<div className={styles.profileHeader}>
					<div className={styles.avatarWrapper}>
						<img
							className={styles.avatar}
							src={getAvatarUrl(user.id, user.avatar, 96)}
							alt=""
						/>
						<span className={`${styles.statusDot} ${styles[status]}`} />
					</div>

					<div
						className={`${styles.statusBubble} ${
							!hasCustomStatus ? styles.statusBubblePlaceholder : styles.statusBubbleHasActions
						}`}
						role="button"
						tabIndex={0}
						onClick={handleEditStatus}
						onKeyDown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault()
								handleEditStatus()
							}
						}}
					>
						{!hasCustomStatus && (
							<span className={styles.statusBubbleIcon} aria-hidden="true">
								<PlusIcon />
							</span>
						)}
						<span className={styles.statusBubbleText}>{statusBubbleText}</span>
						{hasCustomStatus && (
							<div className={styles.statusActions}>
								<button
									type="button"
									className={styles.statusActionButton}
									aria-label="Edit status"
									onClick={(event) => {
										event.stopPropagation()
										handleEditStatus()
									}}
								>
									<EditIcon />
								</button>
								<button
									type="button"
									className={styles.statusActionButton}
									aria-label="Clear status"
									onClick={(event) => {
										event.stopPropagation()
										handleClearStatus()
									}}
								>
									<TrashIcon />
								</button>
							</div>
						)}
					</div>
				</div>

				<div className={styles.profileBody}>
					<h2 className={styles.displayName}>{displayName}</h2>
					<div className={styles.subline}>
						<span className={styles.handle}>{handle}</span>
						<span className={styles.dot}>|</span>
						<span className={styles.pronouns}>{pronouns}</span>
						<div className={styles.badges}>
							{displayActivities.length > 0
								? displayActivities.map((activity) => (
										<span
											key={`${activity.type}-${activity.name}`}
											className={`${styles.badge} ${styles.badgeActive}`}
											title={activity.name}
										/>
									))
								: (
									<>
										<span className={styles.badge} />
										<span className={styles.badge} />
										<span className={styles.badge} />
									</>
								)}
						</div>
					</div>

					<p className={styles.aboutText}>{aboutText}</p>

					{callState && (
						<div className={styles.callCard}>
							<div className={styles.callHeader}>
								<span className={styles.callTitle}>{callTitle}</span>
								<span className={styles.callInfo} aria-hidden="true">
									i
								</span>
							</div>
							<div className={styles.callBody}>
								<div className={styles.callAvatarStack}>
									{visibleParticipants.map((participant) => {
										const name = participant.global_name ?? participant.username
										return (
											<span key={participant.id} className={styles.callAvatarWrap}>
												<img
													className={styles.callAvatar}
													src={getAvatarUrl(participant.id, participant.avatar, 32)}
													alt={name}
												/>
											</span>
										)
									})}
									{overflowCount > 0 && (
										<span className={styles.callAvatarOverflow}>+{overflowCount}</span>
									)}
								</div>
								<div className={styles.callName}>{callName}</div>
							</div>
							<button className={styles.callButton} type="button">
								{callActionLabel}
							</button>
						</div>
					)}

					<div className={styles.actionPanel}>
						<ListItem
							label="Edit Profile"
							icon={<EditIcon />}
							rightContent={<span className={styles.newBadge}>NEW</span>}
							onClick={onClose}
							role="menuitem"
						/>
						<ListItemSeparator />
						<div
							ref={presenceRowRef}
							onFocus={() => setShowPresenceMenu(true)}
							onBlur={() => {
								requestAnimationFrame(() => {
									const active = document.activeElement
									if (
										presenceRowRef.current?.contains(active) ||
										presencePanelRef.current?.contains(active)
									) {
										return
									}
									setShowPresenceMenu(false)
									setShowPresenceDurationMenu(false)
									setPresenceDurationFor(null)
								})
							}}
							onKeyDown={handlePresenceKeyDown}
						>
							<ListItem
								label={presenceLabel}
								icon={<PresenceDot status={status} />}
								rightContent={<ChevronRightIcon />}
								onMouseEnter={() => setShowPresenceMenu(true)}
								onClick={handlePresenceToggle}
								isHighlighted={showPresenceMenu}
								role="menuitem"
							/>
						</div>
						<ListItemSeparator />
						<div
							ref={switchRowRef}
							onFocus={() => setShowSwitchMenu(true)}
							onBlur={() => {
								requestAnimationFrame(() => {
									const active = document.activeElement
									if (
										switchRowRef.current?.contains(active) ||
										switchPanelRef.current?.contains(active)
									) {
										return
									}
									setShowSwitchMenu(false)
								})
							}}
							onKeyDown={handleSwitchKeyDown}
						>
							<ListItem
								ref={switchItemRef}
								label="Switch Accounts"
								icon={<SwitchIcon />}
								rightContent={<ChevronRightIcon />}
								onMouseEnter={() => setShowSwitchMenu(true)}
								onClick={handleSwitchToggle}
								isHighlighted={showSwitchMenu}
								role="menuitem"
							/>
						</div>
					</div>
				</div>
			</div>

			{showPresenceMenu && (
				<div
					className={`${styles.presencePanel} ${
						presencePanelSide === 'left' ? styles.presencePanelLeft : styles.presencePanelRight
					}`}
					style={presencePanelTop !== null ? { top: presencePanelTop } : undefined}
					ref={presencePanelRef}
					onMouseEnter={() => setShowPresenceMenu(true)}
					onMouseLeave={() => {
						setShowPresenceMenu(false)
						setShowPresenceDurationMenu(false)
						setPresenceDurationFor(null)
					}}
					onKeyDown={handlePresenceKeyDown}
					role="menu"
				>
					{presenceOptions.map((option) => (
						<ListItem
							key={option.value}
							label={option.label}
							description={option.description}
							icon={<PresenceDot status={option.value} />}
							rightContent={option.hasDurationMenu ? <ChevronRightIcon /> : null}
							onMouseEnter={() => {
								if (option.hasDurationMenu) {
									setShowPresenceDurationMenu(true)
									setPresenceDurationFor(option.value)
								} else {
									setShowPresenceDurationMenu(false)
									setPresenceDurationFor(null)
								}
							}}
							onClick={() => handlePresenceSelect(option.value)}
							isSelected={status === option.value}
							role="menuitem"
						/>
					))}

					{showPresenceDurationMenu && presenceDurationFor && (
						<div
							className={`${styles.presenceSubmenu} ${
								presencePanelSide === 'left'
									? styles.presenceSubmenuLeft
									: styles.presenceSubmenuRight
							}`}
						>
							{presenceDurations.map((duration) => (
								<ListItem
									key={duration.label}
									label={duration.label}
									onClick={() => handlePresenceDurationSelect(duration.durationMs)}
									role="menuitem"
								/>
							))}
						</div>
					)}
				</div>
			)}

			{showSwitchMenu && (
				<div
					className={`${styles.switchPanel} ${
						switchPanelSide === 'left' ? styles.switchPanelLeft : styles.switchPanelRight
					}`}
					style={switchPanelTop !== null ? { top: switchPanelTop } : undefined}
					ref={switchPanelRef}
					onMouseEnter={() => setShowSwitchMenu(true)}
					onMouseLeave={() => setShowSwitchMenu(false)}
					onKeyDown={handleSwitchPanelKeyDown}
				>
					{accounts.map((account) => (
						<ListItem
							key={account.id}
							label={account.username}
							description={account.status ? account.status : 'offline'}
							icon={
								<img
									className={styles.switchAvatar}
									src={getAvatarUrl(account.id, account.avatar, 32)}
									alt=""
								/>
							}
							rightContent={account.id === user.id ? <CheckIcon /> : null}
							onClick={onClose}
							role="menuitem"
						/>
					))}
					<ListItemSeparator />
					<ListItem label="Manage Accounts" icon={<SwitchIcon />} onClick={onClose} role="menuitem" />
				</div>
			)}

			</DropdownContainer>
			{isStatusModalOpen && (
				<StatusEditorModal
					user={user}
					displayName={displayName}
					handle={handle}
					initialStatus={customStatus ?? ''}
					placeholder={statusPlaceholder}
					onSave={handleSaveStatus}
					onClose={() => setIsStatusModalOpen(false)}
				/>
			)}
		</>
	)
}

function EditIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M4 17.25V20h2.75L17.8 8.95l-2.75-2.75L4 17.25zm15.71-9.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-1.92 1.92 3.91 3.91 1.92-1.92z" />
		</svg>
	)
}

function PresenceDot({ status }: { status: PresenceStatus }) {
	return <span className={`${styles.presenceDot} ${styles[status]}`} aria-hidden="true" />
}

function SwitchIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z" />
		</svg>
	)
}

function ChevronRightIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M9.29 6.71a1 1 0 0 0 0 1.41L13.17 12l-3.88 3.88a1 1 0 1 0 1.41 1.41l4.59-4.59a1 1 0 0 0 0-1.41L10.7 6.7a1 1 0 0 0-1.41.01z" />
		</svg>
	)
}

function CheckIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M9 16.17l-3.88-3.88a1 1 0 0 0-1.41 1.41l4.59 4.59a1 1 0 0 0 1.41 0l10-10a1 1 0 1 0-1.41-1.41L9 16.17z" />
		</svg>
	)
}

function PlusIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M11 5a1 1 0 0 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5z" />
		</svg>
	)
}

function TrashIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
			<path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
		</svg>
	)
}

function formatHandle(user: StageUser) {
	if (user.discriminator && user.discriminator !== '0') {
		return `${user.username}#${user.discriminator}`
	}
	return user.username
}

function formatPresenceLabel(status: PresenceStatus) {
	switch (status) {
		case 'idle':
			return 'Idle'
		case 'dnd':
			return 'Do Not Disturb'
		case 'offline':
			return 'Invisible'
		default:
			return 'Online'
	}
}

function formatActivity(activity?: StageActivity) {
	if (!activity) return null

	let verb = 'Playing'
	switch (activity.type) {
		case 1:
			verb = 'Streaming'
			break
		case 2:
			verb = 'Listening to'
			break
		case 3:
			verb = 'Watching'
			break
		case 5:
			verb = 'Competing in'
			break
		default:
			verb = 'Playing'
	}

	return `${verb} ${activity.name}`.trim()
}
