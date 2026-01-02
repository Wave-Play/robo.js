import { useMemo } from 'react'
import type { StageMessage, StageReaction, StageUser } from '../../types/stage'
import { formatTimestamp } from '../../utils/time'
import { getAvatarUrl } from '../../utils/avatar'
import { Markdown } from '../common/Markdown'
import { Embed } from './Embed'
import { Attachments } from './Attachments'
import { ComponentsContainer } from './ComponentRow'
import { Reactions } from './Reactions'
import { EphemeralBadge } from './EphemeralBadge'
import { useUserById } from '../../hooks/useCurrentUser'
import { useStageData } from '../../hooks/useStageData'
import styles from './Message.module.css'

// Interaction types (from Discord API)
const INTERACTION_TYPES = {
	APPLICATION_COMMAND: 2,
	MESSAGE_COMPONENT: 3,
	APPLICATION_COMMAND_AUTOCOMPLETE: 4,
	MODAL_SUBMIT: 5
}

// Discord message flags
const MESSAGE_FLAGS = {
	EPHEMERAL: 64,           // 1 << 6
	IS_COMPONENTS_V2: 32768  // 1 << 15
}

// Discord message types (system messages)
const MESSAGE_TYPES = {
	DEFAULT: 0,
	GUILD_MEMBER_JOIN: 7,
	USER_PREMIUM_GUILD_SUBSCRIPTION: 8,
	USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_1: 9,
	USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_2: 10,
	USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_3: 11,
	CHANNEL_FOLLOW_ADD: 12,
	GUILD_DISCOVERY_DISQUALIFIED: 14,
	GUILD_DISCOVERY_REQUALIFIED: 15,
	THREAD_CREATED: 18,
	AUTO_MODERATION_ACTION: 24
}

// System message join variations for visual variety
const JOIN_MESSAGES = [
	(name: string) => `${name} joined the party.`,
	(name: string) => `${name} is here.`,
	(name: string) => `A wild ${name} appeared.`,
	(name: string) => `${name} just landed.`,
	(name: string) => `${name} just slid into the server.`,
	(name: string) => `${name} just showed up!`,
	(name: string) => `Welcome, ${name}. We hope you brought pizza.`,
	(name: string) => `${name} hopped into the server.`,
	(name: string) => `Everyone welcome ${name}!`,
	(name: string) => `Glad you're here, ${name}.`,
	(name: string) => `Good to see you, ${name}.`,
	(name: string) => `Yay you made it, ${name}!`
]

function getJoinMessage(userId: string, username: string): string {
	// Use user ID to deterministically pick a message
	const hash = userId.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)
	const index = Math.abs(hash) % JOIN_MESSAGES.length
	return JOIN_MESSAGES[index](username)
}

interface MessageProps {
	message: StageMessage
	isFirstInGroup: boolean
	isHighlighted?: boolean
<<<<<<< HEAD
	isMentioned?: boolean
=======
	onDismissEphemeral?: (messageId: string) => void
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)
	onButtonClick?: (messageId: string, customId: string) => Promise<void>
	onSelectOption?: (messageId: string, customId: string, values: string[]) => Promise<void>
	onAddReaction?: (messageId: string, emoji: string) => Promise<void>
	onRemoveReaction?: (messageId: string, emoji: string) => Promise<void>
	onContextMenu?: (e: React.MouseEvent, message: StageMessage) => void
	onUserContextMenu?: (e: React.MouseEvent, user: StageUser) => void
}

export function Message({
	message,
	isFirstInGroup,
	isHighlighted,
<<<<<<< HEAD
	isMentioned,
=======
	onDismissEphemeral,
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)
	onButtonClick,
	onSelectOption,
	onAddReaction,
	onRemoveReaction,
	onContextMenu,
	onUserContextMenu
}: MessageProps) {
	const { author: messageAuthor, content, timestamp, edited_timestamp, embeds, attachments, components, reactions, flags, pinned, message_reference, type, interaction_metadata } = message

	// Look up the latest user data by ID - this makes user display reactive to changes
	// Falls back to the embedded author data if user is not found in state
	const resolvedUser = useUserById(messageAuthor.id, messageAuthor)
	const author = useMemo(() => resolvedUser ?? messageAuthor, [resolvedUser, messageAuthor])

	const isEphemeral = ((flags ?? 0) & MESSAGE_FLAGS.EPHEMERAL) !== 0
	const isV2 = ((flags ?? 0) & MESSAGE_FLAGS.IS_COMPONENTS_V2) !== 0
	const isSystemMessage = type === MESSAGE_TYPES.GUILD_MEMBER_JOIN
<<<<<<< HEAD
	const isCommandResponse = interaction_metadata && interaction_metadata.type === INTERACTION_TYPES.APPLICATION_COMMAND
=======
	const rawMessage = message as StageMessage & {
		interaction_metadata?: { user?: StageUser }
		interactionMetadata?: { user?: StageUser }
		interaction?: { user?: StageUser; name?: string }
	}
	const interactionMetadata = rawMessage.interaction_metadata ?? rawMessage.interactionMetadata
	const interactionUser = interactionMetadata?.user ?? rawMessage.interaction?.user
	const interactionName = rawMessage.interaction?.name
	const interactionMeta = interactionUser ? { user: interactionUser, name: interactionName } : undefined
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)

	// Render system message (member join)
	if (isSystemMessage) {
		const joinText = getJoinMessage(author.id, author.username)
		return (
			<div
				className={styles.systemMessage}
				onContextMenu={onContextMenu ? (e) => onContextMenu(e, message) : undefined}
			>
				<div className={styles.systemIcon}>
					<JoinArrowIcon />
				</div>
				<div className={styles.systemContent}>
					<span className={styles.systemText}>{joinText}</span>
					<span className={styles.systemTimestamp}>{formatTimestamp(timestamp)}</span>
				</div>
				{components && components.length > 0 && onButtonClick && onSelectOption && (
					<div className={styles.systemActions}>
						<ComponentsContainer
							components={components}
							messageId={message.id}
							channelId={message.channel_id}
							onButtonClick={(customId) => onButtonClick(message.id, customId)}
							onSelectOption={(customId, values) => onSelectOption(message.id, customId, values)}
							isV2={isV2}
						/>
					</div>
				)}
			</div>
		)
	}

	return (
<<<<<<< HEAD
		<>
			{/* Command invocation header - shows "User used /command" with avatar */}
			{isCommandResponse && interaction_metadata && (
				<div className={styles.commandInvocation}>
					<img
						src={getAvatarUrl(interaction_metadata.user.id, interaction_metadata.user.avatar)}
						alt=""
						className={styles.commandAvatar}
						onError={(e) => {
							const target = e.target as HTMLImageElement
							target.src = getAvatarUrl(interaction_metadata.user.id, null)
						}}
					/>
					<span className={styles.commandUser}>{interaction_metadata.user.username}</span>
					<span className={styles.commandText}> used </span>
					<SlashCommandIcon />
					<span className={styles.commandName}>{interaction_metadata.name || 'command'}</span>
				</div>
			)}
			<div
				className={`${styles.message} ${isHighlighted ? styles.highlighted : ''} ${isMentioned ? styles.mentioned : ''} ${isEphemeral ? styles.ephemeral : ''}`}
				onContextMenu={onContextMenu ? (e) => onContextMenu(e, message) : undefined}
			>
				{/* Reply reference indicator */}
=======
		<div
			className={`${styles.message} ${isHighlighted ? styles.highlighted : ''} ${isEphemeral ? styles.ephemeral : ''}`}
			onContextMenu={onContextMenu ? (e) => onContextMenu(e, message) : undefined}
		>
			<div className={styles.hoverActions}>
				<button type="button" aria-label="Add reaction">
					<SmileIcon />
				</button>
				<button type="button" aria-label="Reply">
					<ReplyActionIcon />
				</button>
				<button type="button" aria-label="More">
					<MoreIcon />
				</button>
			</div>
			{/* Reply reference indicator */}
>>>>>>> 29e5f5ec (fix: adjusted mock ui's small issues)
			{message_reference && (
				<div className={styles.replyReference}>
					<ReplyIcon />
					<span className={styles.replyText}>Replying to a message</span>
				</div>
			)}
			{isFirstInGroup ? (
				<>
					<div className={styles.avatar}>
						<img
							src={getAvatarUrl(author.id, author.avatar)}
							alt=""
							className={styles.avatarImage}
							onError={(e) => {
								// Fallback to default avatar on error
								const target = e.target as HTMLImageElement
								target.src = getAvatarUrl(author.id, null)
							}}
							onContextMenu={
								onUserContextMenu
									? (e) => {
											e.stopPropagation()
											onUserContextMenu(e, author)
										}
									: undefined
							}
						/>
					</div>
					<div className={styles.content}>
						<div className={styles.header}>
							<span
								className={styles.author}
								onContextMenu={
									onUserContextMenu
										? (e) => {
												e.stopPropagation()
												onUserContextMenu(e, author)
											}
										: undefined
								}
							>
								{author.username}
							</span>
							{author.bot && (
								<span className={styles.botBadge}>
									<VerifiedCheckIcon />
									<span>APP</span>
								</span>
							)}
							{pinned && <span className={styles.pinnedBadge} title="Pinned"><PinIcon /></span>}
							<span className={styles.timestamp}>{formatTimestamp(timestamp)}</span>
						</div>
						<MessageContent
							content={content}
							editedTimestamp={edited_timestamp}
							embeds={embeds}
							attachments={attachments}
							components={components}
							reactions={reactions}
							interactionMeta={interactionMeta}
							messageId={message.id}
							channelId={message.channel_id}
							isEphemeral={isEphemeral}
							isV2={isV2}
							onDismissEphemeral={onDismissEphemeral}
							onButtonClick={onButtonClick}
							onSelectOption={onSelectOption}
							onAddReaction={onAddReaction}
							onRemoveReaction={onRemoveReaction}
						/>
					</div>
				</>
			) : (
				<>
					<div className={styles.timestampGutter}>
						<span className={styles.hoverTimestamp}>{formatTimestamp(timestamp, 'short')}</span>
					</div>
					<div className={styles.content}>
						<MessageContent
							content={content}
							editedTimestamp={edited_timestamp}
							embeds={embeds}
							attachments={attachments}
							components={components}
							reactions={reactions}
							interactionMeta={interactionMeta}
							messageId={message.id}
							channelId={message.channel_id}
							isEphemeral={isEphemeral}
							isV2={isV2}
							onDismissEphemeral={onDismissEphemeral}
							onButtonClick={onButtonClick}
							onSelectOption={onSelectOption}
							onAddReaction={onAddReaction}
							onRemoveReaction={onRemoveReaction}
						/>
					</div>
				</>
			)}
		</div>
		</>
	)
}

interface MessageContentProps {
	content: string
	editedTimestamp?: string | null
	embeds?: unknown[]
	attachments?: unknown[]
	components?: unknown[]
	reactions?: StageReaction[]
	interactionMeta?: {
		user?: StageUser
		name?: string
	}
	messageId: string
	channelId: string
	isEphemeral?: boolean
	isV2?: boolean
	onDismissEphemeral?: (messageId: string) => void
	onButtonClick?: (messageId: string, customId: string) => Promise<void>
	onSelectOption?: (messageId: string, customId: string, values: string[]) => Promise<void>
	onAddReaction?: (messageId: string, emoji: string) => Promise<void>
	onRemoveReaction?: (messageId: string, emoji: string) => Promise<void>
}

function MessageContent({
	content,
	editedTimestamp,
	embeds,
	attachments,
	components,
	reactions,
	interactionMeta,
	messageId,
	channelId,
	isEphemeral,
	isV2,
	onDismissEphemeral,
	onButtonClick,
	onSelectOption,
	onAddReaction,
	onRemoveReaction
}: MessageContentProps) {
	const { members, roles, channels } = useStageData()

	// Type assertion for embeds and attachments - they come as unknown[] from StageMessage
	const typedEmbeds = embeds as Array<{
		color?: number
		author?: { name?: string; url?: string; icon_url?: string }
		title?: string
		url?: string
		description?: string
		fields?: Array<{ name: string; value: string; inline?: boolean }>
		image?: { url: string; width?: number; height?: number }
		thumbnail?: { url: string }
		video?: { url: string; width?: number; height?: number }
		footer?: { text: string; icon_url?: string }
		timestamp?: string
	}>

	const typedAttachments = attachments as Array<{
		id: string
		filename: string
		description?: string
		content_type?: string
		size: number
		url: string
		proxy_url?: string
		width?: number
		height?: number
		duration_secs?: number
		waveform?: string
		spoiler?: boolean
	}>

	return (
		<div className={styles.messageContent}>
			{interactionMeta?.user && (
				<div className={styles.interactionInfo}>
					<span className={styles.interactionIcon}>
						<SlashIcon />
					</span>
					<span className={styles.interactionText}>
						{interactionMeta.user.username} used {interactionMeta.name ? `/${interactionMeta.name}` : 'a command'}
					</span>
				</div>
			)}
			{/* V2 replaces content and embeds - only render these in V1 mode */}
			{!isV2 && content && (
				<div className={styles.textContent}>
					<Markdown text={content} members={members} roles={roles} channels={channels} />
					{editedTimestamp && (
						<span
							className={styles.edited}
							title={`Edited ${formatTimestamp(editedTimestamp)}`}
						>
							(edited)
						</span>
					)}
				</div>
			)}

			{/* Render embeds (V1 only) */}
			{!isV2 && typedEmbeds && typedEmbeds.length > 0 && (
				<div className={styles.embeds}>
					{typedEmbeds.map((embed, i) => (
						<Embed key={i} embed={embed} />
					))}
				</div>
			)}

			{/* Render attachments */}
			{typedAttachments && typedAttachments.length > 0 && (
				<Attachments attachments={typedAttachments} />
			)}

			{/* Render components (V1 action rows or V2 display components) */}
			{components && components.length > 0 && onButtonClick && onSelectOption && (
				<ComponentsContainer
					components={components}
					messageId={messageId}
					channelId={channelId}
					onButtonClick={(customId) => onButtonClick(messageId, customId)}
					onSelectOption={(customId, values) => onSelectOption(messageId, customId, values)}
					isV2={isV2}
				/>
			)}

			{/* Render reactions - always show to allow adding first reaction */}
			{onAddReaction && onRemoveReaction && (
				<Reactions
					messageId={messageId}
					reactions={reactions || []}
					onAddReaction={onAddReaction}
					onRemoveReaction={onRemoveReaction}
				/>
			)}

			{/* Ephemeral badge */}
			{isEphemeral && (
				<EphemeralBadge onDismiss={onDismissEphemeral ? () => onDismissEphemeral(messageId) : undefined} />
			)}
		</div>
	)
}

// Icon components for message indicators
function PinIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l5.59-5.59L19 10l-7 7z" />
		</svg>
	)
}

function ReplyIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
			<path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
		</svg>
	)
}

function SlashIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M7 7h4l-2.5 5H4l3-5zm6.5 10h-4l2.5-5h4l-2.5 5z" />
		</svg>
	)
}

function SmileIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20zm-4 7a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3zm8 0a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3zm-8.2 6.2a1 1 0 0 1 1.4 0a4.5 4.5 0 0 0 5.6 0a1 1 0 1 1 1.4 1.4a6.5 6.5 0 0 1-8.4 0a1 1 0 0 1 0-1.4z" />
		</svg>
	)
}

function ReplyActionIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
		</svg>
	)
}

function MoreIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M6 12a2 2 0 1 1-4 0a2 2 0 0 1 4 0zm8 0a2 2 0 1 1-4 0a2 2 0 0 1 4 0zm8 0a2 2 0 1 1-4 0a2 2 0 0 1 4 0z" />
		</svg>
	)
}

function JoinArrowIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
			<path d="M5 12h14M14 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
		</svg>
	)
}

function VerifiedCheckIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
			<path d="M7.4,11.17,4,8.62,5,7.26l2,1.53L10.64,4l1.36,1Z" />
		</svg>
	)
}

function SlashCommandIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={styles.slashIcon}>
			<path d="M5 19h4L12 5H8L5 19zm7 0h4L19 5h-4L12 19z" />
		</svg>
	)
}
