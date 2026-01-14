import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useStageData } from '../../hooks/useStageData'
import { useSession } from '../../stores/sessionStore'
import { CommandAutocomplete } from './CommandAutocomplete'
import { MentionAutocomplete, type MentionItem } from './MentionAutocomplete'
import { EmojiPicker } from '../common/EmojiPicker'
import type { StageApplicationCommand } from '../../types/stage'
import styles from './MessageInput.module.css'
import GiftIcon from '../icons/gift'
import GifIcon from '../icons/gif'
import EmojiIcon from '../icons/emoji'
import StickersIcon from '../icons/stickers'

interface MessageInputProps {
	channelId: string
	channelName: string
}

export function MessageInput({ channelId, channelName }: MessageInputProps) {
	const { sendMessage, replyingTo, clearReplyingTo, commands, invokeCommand, members, roles } = useStageData()
	const { selectedGuildId } = useSession()
	// Filter to only slash commands (type 1 = ChatInput)
	const slashCommands = useMemo(() => commands.filter((c) => (c.type ?? 1) === 1), [commands])
	const [inputValue, setInputValue] = useState('') // Plain text for autocomplete detection
	const [isSending, setIsSending] = useState(false)
	const [showCommandAutocomplete, setShowCommandAutocomplete] = useState(false)
	const [commandSearch, setCommandSearch] = useState('')
	const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false)
	const [mentionSearch, setMentionSearch] = useState('')
	const [showEmojiPicker, setShowEmojiPicker] = useState(false)
	const inputRef = useRef<HTMLDivElement>(null)
	const emojiButtonRef = useRef<HTMLDivElement>(null)

	// Extract actual message content from contentEditable (replaces mention spans with their syntax)
	const getMessageContent = useCallback(() => {
		if (!inputRef.current) return ''

		let content = ''
		const walk = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				content += node.textContent || ''
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as HTMLElement
				// Check if this is a mention span with data-syntax
				const syntax = el.getAttribute('data-syntax')
				if (syntax) {
					content += syntax
				} else if (el.tagName === 'BR') {
					content += '\n'
				} else {
					// Recurse into children
					for (const child of el.childNodes) {
						walk(child)
					}
				}
			}
		}

		for (const child of inputRef.current.childNodes) {
			walk(child)
		}

		return content
	}, [])

	// Check if input starts with "/" and update autocomplete state
	// Note: We always read from slashCommands directly (no caching) to avoid stale data
	useEffect(() => {
		if (inputValue.startsWith('/')) {
			setShowCommandAutocomplete(true)
			setCommandSearch(inputValue.slice(1)) // Text after "/"
		} else {
			setShowCommandAutocomplete(false)
			setCommandSearch('')
		}
	}, [inputValue])

	// Check for @ mention trigger and update autocomplete state
	useEffect(() => {
		// Find the last @ that's not inside a completed mention
		const lastAtIndex = inputValue.lastIndexOf('@')
		if (lastAtIndex === -1) {
			setShowMentionAutocomplete(false)
			setMentionSearch('')
			return
		}

		// Check if this @ is at the start or after a space (valid trigger position)
		const charBefore = lastAtIndex > 0 ? inputValue[lastAtIndex - 1] : ' '
		if (charBefore !== ' ' && charBefore !== '\n' && lastAtIndex !== 0) {
			setShowMentionAutocomplete(false)
			setMentionSearch('')
			return
		}

		// Get the text after @
		const afterAt = inputValue.slice(lastAtIndex + 1)

		// If there's a space after the search text, close autocomplete
		if (afterAt.includes(' ') || afterAt.includes('\n')) {
			setShowMentionAutocomplete(false)
			setMentionSearch('')
			return
		}

		// Don't show mention autocomplete when command autocomplete is active
		if (showCommandAutocomplete) {
			setShowMentionAutocomplete(false)
			return
		}

		setShowMentionAutocomplete(true)
		setMentionSearch(afterAt)
	}, [inputValue, showCommandAutocomplete])

	// Handle input changes from contentEditable
	const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
		setInputValue(e.currentTarget.textContent || '')
	}

	// Handle command selection from autocomplete
	const handleCommandSelect = useCallback(
		async (command: StageApplicationCommand, options: Record<string, unknown>) => {
			setIsSending(true)
			try {
				await invokeCommand(command.name, options, channelId)

				// Clear input after successful command
				setInputValue('')
				if (inputRef.current) inputRef.current.textContent = ''
				setShowCommandAutocomplete(false)
			} catch (err) {
				console.error('Failed to invoke command:', err)
			} finally {
				setIsSending(false)
			}
		},
		[invokeCommand, channelId]
	)

	// Close autocomplete
	const handleCloseAutocomplete = useCallback(() => {
		setShowCommandAutocomplete(false)
		// Clear the slash from input when closing via escape
		if (inputValue.startsWith('/')) {
			setInputValue('')
			if (inputRef.current) inputRef.current.textContent = ''
		}
	}, [inputValue])

	// Handle mention selection from autocomplete
	const handleMentionSelect = useCallback(
		(mention: MentionItem) => {
			if (!inputRef.current) return

			// Build the mention syntax and display text
			let mentionSyntax: string
			let displayText: string
			let mentionClass: string

			switch (mention.type) {
				case 'user':
					mentionSyntax = `<@${mention.id}>`
					displayText = `@${mention.name}`
					mentionClass = styles.mentionUser
					break
				case 'role':
					mentionSyntax = `<@&${mention.id}>`
					displayText = `@${mention.name}`
					mentionClass = styles.mentionRole
					break
				case 'everyone':
					mentionSyntax = '@everyone'
					displayText = '@everyone'
					mentionClass = styles.mentionEveryone
					break
				case 'here':
					mentionSyntax = '@here'
					displayText = '@here'
					mentionClass = styles.mentionHere
					break
			}

			// Get the selection and find where to insert
			const selection = window.getSelection()
			if (!selection || selection.rangeCount === 0) return

			// Find and remove the @search text
			const range = selection.getRangeAt(0)

			// We need to find the @ trigger in the current text node
			const container = range.startContainer
			if (container.nodeType === Node.TEXT_NODE) {
				const textContent = container.textContent || ''
				const cursorPos = range.startOffset
				// Find the @ before cursor
				const beforeCursor = textContent.slice(0, cursorPos)
				const atIndex = beforeCursor.lastIndexOf('@')

				if (atIndex !== -1) {
					// Create a range that selects from @ to cursor
					const deleteRange = document.createRange()
					deleteRange.setStart(container, atIndex)
					deleteRange.setEnd(container, cursorPos)
					deleteRange.deleteContents()

					// Create the mention span
					const mentionSpan = document.createElement('span')
					mentionSpan.className = mentionClass
					mentionSpan.setAttribute('data-syntax', mentionSyntax)
					mentionSpan.setAttribute('contenteditable', 'false')
					mentionSpan.textContent = displayText

					// Insert the mention span
					deleteRange.insertNode(mentionSpan)

					// Add a space after the mention and position cursor there
					const spaceNode = document.createTextNode('\u00A0') // Non-breaking space
					mentionSpan.after(spaceNode)

					// Move cursor after the space
					const newRange = document.createRange()
					newRange.setStartAfter(spaceNode)
					newRange.collapse(true)
					selection.removeAllRanges()
					selection.addRange(newRange)
				}
			}

			// Update the plain text value for autocomplete detection
			setInputValue(inputRef.current.textContent || '')
			setShowMentionAutocomplete(false)
			setMentionSearch('')
		},
		[]
	)

	// Close mention autocomplete
	const handleCloseMentionAutocomplete = useCallback(() => {
		setShowMentionAutocomplete(false)
		setMentionSearch('')
	}, [])

	// Handle emoji selection from picker
	const handleEmojiSelect = useCallback(
		(emoji: string) => {
			if (!inputRef.current) return

			// Get selection
			const selection = window.getSelection()
			if (selection && selection.rangeCount > 0) {
				const range = selection.getRangeAt(0)
				// Insert emoji at cursor position
				const textNode = document.createTextNode(emoji)
				range.deleteContents()
				range.insertNode(textNode)
				// Move cursor after emoji
				range.setStartAfter(textNode)
				range.collapse(true)
				selection.removeAllRanges()
				selection.addRange(range)
			} else {
				// No selection, append to end
				inputRef.current.textContent = (inputRef.current.textContent || '') + emoji
			}

			// Update state
			setInputValue(inputRef.current.textContent || '')
			setShowEmojiPicker(false)
			// Focus the input
			inputRef.current.focus()
		},
		[]
	)

	// Handle message submission
	const handleSubmit = async () => {
		const content = getMessageContent().trim()
		if (!content || isSending) return

		setIsSending(true)
		try {
			const messageReference = replyingTo ? { message_id: replyingTo.id, channel_id: channelId } : undefined

			await sendMessage(content, channelId, messageReference)

			// Clear input and reply state
			setInputValue('')
			if (inputRef.current) inputRef.current.innerHTML = ''
			clearReplyingTo()
		} catch (err) {
			console.error('Failed to send message:', err)
		} finally {
			setIsSending(false)
		}
	}

	// Handle keyboard events - Enter to send, Shift+Enter for newline
	// Note: Arrow keys, Tab, Enter for autocomplete are handled by CommandAutocomplete/MentionAutocomplete via document listener
	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		// When command autocomplete is showing, let it handle these keys
		if (showCommandAutocomplete) {
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab' || e.key === 'Enter') {
				// Don't prevent default here - CommandAutocomplete handles it via document listener
				return
			}
			if (e.key === 'Escape') {
				e.preventDefault()
				handleCloseAutocomplete()
				return
			}
		}

		// When mention autocomplete is showing, let it handle these keys
		if (showMentionAutocomplete) {
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab' || e.key === 'Enter') {
				// Don't prevent default here - MentionAutocomplete handles it via document listener
				return
			}
			if (e.key === 'Escape') {
				e.preventDefault()
				handleCloseMentionAutocomplete()
				return
			}
		}

		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			handleSubmit()
		}
	}

	// Handle form submission
	const handleFormSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		handleSubmit()
	}

	return (
		<form className={styles.form} onSubmit={handleFormSubmit}>
			{/* Reply preview */}
			{replyingTo && (
				<div className={styles.replyPreview}>
					<div className={styles.replyContent}>
						<ReplyIcon />
						<span className={styles.replyText}>
							Replying to <strong>{replyingTo.author.username}</strong>
						</span>
					</div>
					<button type="button" className={styles.replyClose} onClick={clearReplyingTo}>
						<CloseIcon />
					</button>
				</div>
			)}
			<div>
				<div className={styles.container}>
					{/* Slash command autocomplete popover */}
					{showCommandAutocomplete && (
						<CommandAutocomplete
							search={commandSearch}
							commands={slashCommands}
							onSelect={handleCommandSelect}
							onClose={handleCloseAutocomplete}
						/>
					)}
					{/* Mention autocomplete popover */}
					{showMentionAutocomplete && (
						<MentionAutocomplete
							search={mentionSearch}
							members={members}
							roles={roles}
							onSelect={handleMentionSelect}
							onClose={handleCloseMentionAutocomplete}
						/>
					)}
					<div className={styles.channelTextArea}>
						<div className={styles.inputWrapper}>
							<div className={styles.inner}>
								<div className={styles.attachWrapper}>
									<div className={styles.uploadInput}>
										<input className="file-input" tabIndex={-1} multiple accept="" aria-hidden="true" type="file" />
									</div>
									<div className={styles.attachButton} aria-label="Upload a file" role="button" tabIndex={0}>
										<div className={styles.attachButtonInner}>
											<svg aria-hidden="true" role="img" width="24" height="24" viewBox="0 0 24 24">
												<path
													fill="currentColor"
													d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"
												/>
											</svg>
										</div>
									</div>
								</div>
								<div className={styles.textAreaContainer}>
									<div>
										<div
											className={styles.placeholder}
											aria-hidden="true"
											style={{ display: inputValue ? 'none' : undefined }}
										>
											Message #{channelName}
										</div>
										<div
											role="textbox"
											aria-multiline="true"
											spellCheck="true"
											aria-haspopup="listbox"
											aria-invalid="false"
											aria-autocomplete="list"
											className={styles.input}
											autoCorrect="off"
											data-can-focus="true"
											aria-label={`Message #${channelName}`}
											contentEditable={!isSending}
											suppressContentEditableWarning={true}
											ref={inputRef}
											onInput={handleInput}
											onKeyDown={handleKeyDown}
										/>
									</div>
								</div>
								<div className={styles.buttons}>
									<div className={styles.iconButton} aria-label="Send a gift" role="button" tabIndex={0}>
										<div className={styles.iconButtonInner}>
											<GiftIcon width={25} height={25} />
										</div>
									</div>

									<div className={styles.iconButton} aria-label="Open GIF picker" role="button" tabIndex={0}>
										<div className={styles.iconButtonInner}>
											<GifIcon  width={25} height={25} />
										</div>
									</div>

									<div className={styles.iconButton} aria-label="Open sticker picker" role="button" tabIndex={0}>
										<div className={styles.iconButtonInner}>
											<StickersIcon  width={25} height={25} />
										</div>
									</div>

									<div className={styles.emojiButtonWrapper}>
										<div
											ref={emojiButtonRef}
											className={styles.iconButton}
											aria-label="Add Emoji"
											role="button"
											tabIndex={0}
											onClick={() => setShowEmojiPicker((prev) => !prev)}
										>
											<div className={styles.iconButtonInner}>
												<EmojiIcon width={25} height={25} />
											</div>
										</div>
										{showEmojiPicker && (
											<EmojiPicker
												onSelect={handleEmojiSelect}
												onClose={() => setShowEmojiPicker(false)}
											/>
										)}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</form>
	)
}

function ReplyIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
		</svg>
	)
}

function CloseIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
		</svg>
	)
}
