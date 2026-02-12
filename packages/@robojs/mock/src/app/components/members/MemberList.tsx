import { useMemo, useState, useCallback, useRef } from 'react'
import type { StageMember, StageRole, StageUser, StageApplicationCommand } from '../../types/stage'
import { useStageData } from '../../hooks/useStageData'
import { useContextMenu } from '../../hooks/useContextMenu'
import { getAvatarUrl } from '../../utils/avatar'
import { UserProfilePopout } from './UserProfilePopout'
import { ContextMenu } from '../context/ContextMenu'
import styles from './MemberList.module.css'

interface MemberListProps {
	members: StageMember[]
	roles: StageRole[]
}

interface MemberGroup {
	name: string
	members: StageMember[]
	color?: number
}

interface PopoutState {
	member: StageMember
	anchorTop: number
}

export function MemberList({ members, roles }: MemberListProps) {
	const containerRef = useRef<HTMLElement>(null)
	const [popoutState, setPopoutState] = useState<PopoutState | null>(null)
	const { commands, currentUser, botUser, invokeContextCommand, openDM } = useStageData()
	const { menu: contextMenu, showMenu: showContextMenu, hideMenu: hideContextMenu } = useContextMenu()

	// Context menu handlers
	const handleUserContextMenu = useCallback(
		(e: React.MouseEvent, user: StageUser) => {
			e.preventDefault()
			e.stopPropagation()
			showContextMenu('user', user.id, user, { x: e.clientX, y: e.clientY })
		},
		[showContextMenu]
	)

	const handleContextCommandClick = useCallback(
		async (command: StageApplicationCommand) => {
			if (!contextMenu) return
			await invokeContextCommand(command.name, 2, contextMenu.targetId, contextMenu.targetData)
		},
		[contextMenu, invokeContextCommand]
	)

	// Handle message user action from context menu
	const handleMessageUser = useCallback(
		async (userId: string) => {
			await openDM(userId)
		},
		[openDM]
	)

	const handleMemberClick = useCallback((member: StageMember, e: React.MouseEvent) => {
		const rect = e.currentTarget.getBoundingClientRect()
		setPopoutState({ member, anchorTop: rect.top })
	}, [])

	// Create role lookup map
	const roleMap = useMemo(() => {
		const map = new Map<string, StageRole>()
		for (const role of roles) {
			map.set(role.id, role)
		}
		return map
	}, [roles])

	// Get member's highest hoisted role
	const getHighestHoistedRole = (member: StageMember): StageRole | null => {
		let highestRole: StageRole | null = null
		for (const roleId of member.roles) {
			const role = roleMap.get(roleId)
			if (role && role.hoist) {
				if (!highestRole || role.position > highestRole.position) {
					highestRole = role
				}
			}
		}
		return highestRole
	}

	// Get member's role color (highest positioned role with color)
	const getMemberColor = (member: StageMember): number => {
		let highestColorRole: StageRole | null = null
		for (const roleId of member.roles) {
			const role = roleMap.get(roleId)
			if (role && role.color !== 0) {
				if (!highestColorRole || role.position > highestColorRole.position) {
					highestColorRole = role
				}
			}
		}
		return highestColorRole?.color ?? 0
	}

	// Group members by hoisted role or online/offline status
	const groupedMembers = useMemo(() => {
		const groups: MemberGroup[] = []
		const hoistedGroups = new Map<string, { role: StageRole; members: StageMember[] }>()
		const onlineNoRole: StageMember[] = []
		const offlineMembers: StageMember[] = []

		for (const member of members) {
			const isOffline = member.user.status === 'offline'

			if (isOffline) {
				offlineMembers.push(member)
				continue
			}

			const hoistedRole = getHighestHoistedRole(member)
			if (hoistedRole) {
				const group = hoistedGroups.get(hoistedRole.id)
				if (group) {
					group.members.push(member)
				} else {
					hoistedGroups.set(hoistedRole.id, { role: hoistedRole, members: [member] })
				}
			} else {
				onlineNoRole.push(member)
			}
		}

		// Sort hoisted roles by position (highest first)
		const sortedHoisted = Array.from(hoistedGroups.values()).sort((a, b) => b.role.position - a.role.position)

		// Add hoisted role groups
		for (const { role, members: roleMembers } of sortedHoisted) {
			groups.push({
				name: role.name,
				members: roleMembers,
				color: role.color
			})
		}

		// Add online members without hoisted role
		if (onlineNoRole.length > 0) {
			groups.push({
				name: 'Online',
				members: onlineNoRole
			})
		}

		// Add offline members
		if (offlineMembers.length > 0) {
			groups.push({
				name: 'Offline',
				members: offlineMembers
			})
		}

		return groups
	}, [members, roleMap])

	// Compute popout position from container ref
	const listLeft = containerRef.current?.getBoundingClientRect().left ?? 0

	// Check if bot has slash commands
	const hasSlashCommands = commands.some((c) => (c.type ?? 1) === 1)

	return (
		<aside ref={containerRef} className={styles.container}>
			{groupedMembers.map((group) => (
				<div key={group.name} className={styles.group}>
					<h3 className={styles.groupHeader}>
						{group.name} — {group.members.length}
					</h3>
					{group.members.map((member) => (
						<MemberItem
							key={`${member.guild_id}-${member.user.id}`}
							member={member}
							color={getMemberColor(member)}
							onClick={(e) => handleMemberClick(member, e)}
							onContextMenu={handleUserContextMenu}
						/>
					))}
				</div>
			))}

			{/* Empty state */}
			{members.length === 0 && (
				<div className={styles.empty}>
					<p>No members</p>
				</div>
			)}

			{/* User profile popout */}
			{popoutState && (
				<UserProfilePopout
					member={popoutState.member}
					roles={roles}
					currentUserId={currentUser?.id}
					botUserId={botUser?.id}
					hasSlashCommands={hasSlashCommands}
					anchorTop={popoutState.anchorTop}
					listLeft={listLeft}
					onClose={() => setPopoutState(null)}
					onMessage={handleMessageUser}
				/>
			)}

			{/* Context menu */}
			{contextMenu && (
				<ContextMenu
					type={contextMenu.type}
					targetId={contextMenu.targetId}
					targetData={contextMenu.targetData}
					position={contextMenu.position}
					commands={commands}
					onClose={hideContextMenu}
					onCommandClick={handleContextCommandClick}
					onMessageUser={handleMessageUser}
				/>
			)}
		</aside>
	)
}

interface MemberItemProps {
	member: StageMember
	color: number
	onClick: (e: React.MouseEvent) => void
	onContextMenu: (e: React.MouseEvent, user: StageUser) => void
}

function MemberItem({ member, color, onClick, onContextMenu }: MemberItemProps) {
	const { user, nick } = member
	const displayName = nick || user.username
	const status = user.status || 'online'

	// Convert color int to CSS hex
	const colorStyle = color !== 0 ? { color: `#${color.toString(16).padStart(6, '0')}` } : undefined

	// Get activity text to display
	const activityText = getActivityText(user.activities)

	return (
		<div className={styles.member} onClick={onClick} onContextMenu={(e) => onContextMenu(e, user)}>
			<div className={styles.avatar}>
				<img
					src={getAvatarUrl(user.id, user.avatar ?? null)}
					alt=""
					className={styles.avatarImage}
					onError={(e) => {
						const target = e.target as HTMLImageElement
						target.src = getAvatarUrl(user.id, null)
					}}
				/>
				<span className={`${styles.statusDot} ${styles[status]}`} />
			</div>
			<div className={styles.info}>
				<span className={`${styles.name} ${user.bot ? styles.bot : ''}`} style={colorStyle}>
					{displayName}
					{user.bot && (
						<span className={styles.botTag}>
							<VerifiedCheckIcon />
							<span>APP</span>
						</span>
					)}
				</span>
				{activityText && <span className={styles.activity}>{activityText}</span>}
			</div>
		</div>
	)
}

function getActivityText(activities?: { name: string; type: number; state?: string }[]): string | null {
	if (!activities || activities.length === 0) return null

	const activity = activities[0]
	// Type 4 is Custom Status
	if (activity.type === 4) {
		return activity.state || activity.name
	}
	// Other activity types
	const prefixes: Record<number, string> = {
		0: 'Playing ',
		1: 'Streaming ',
		2: 'Listening to ',
		3: 'Watching ',
		5: 'Competing in '
	}
	const prefix = prefixes[activity.type] ?? ''
	return prefix + activity.name
}

function VerifiedCheckIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
			<path d="M7.4,11.17,4,8.62,5,7.26l2,1.53L10.64,4l1.36,1Z" />
		</svg>
	)
}
