import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionState } from '../../stores/sessionStore'
import type { StageActivityAuthorizeRequestData } from '../../types/stage'
import { useActivityRpcBridge } from '../../hooks/useActivityRpcBridge'
import { getAvatarUrl } from '../../utils/avatar'
import { AuthConsentModal } from './AuthConsentModal'
import styles from './ActivityView.module.css'

interface ActivityViewProps {
	activity: SessionState['activity']
	onDisconnect: () => void
	overlayRef?: React.Ref<HTMLDivElement>
	currentUser?: { id: string; avatar: string | null; username: string } | null
	minimized?: boolean
	onMinimize?: () => void
	onRestore?: () => void
	/** Callback when an RPC message is rejected (for DevTools diagnostics) */
	onRpcRejected?: (reason: string, event: MessageEvent) => void
	/** Pending AUTHORIZE consent request */
	authorizeRequest?: StageActivityAuthorizeRequestData | null
	/** Called when user approves the consent modal */
	onAuthorizeApprove?: (approvedScopes: string[]) => void
	/** Called when user denies the consent modal */
	onAuthorizeDeny?: () => void
	/** Whether in playback mode (show static indicator instead of iframe) */
	playbackMode?: boolean
}

export function ActivityView({ activity, onDisconnect, overlayRef, currentUser, minimized, onMinimize, onRestore, onRpcRejected, authorizeRequest, onAuthorizeApprove, onAuthorizeDeny, playbackMode }: ActivityViewProps) {
	const [chatHidden, setChatHidden] = useState(false)
	const gradient = activity.bannerGradient || `linear-gradient(135deg, #2a2a2e 0%, ${activity.iconColor || '#3a3a4a'} 100%)`
	const activityName = activity.name || 'Activity'
	const iframeRef = useRef<HTMLIFrameElement>(null)

	// Build iframe URL: prefer proxy-provided iframeUrl, fallback to launch_url + query_params
	const iframeUrl = useMemo(() => {
		if (activity.iframeUrl) return activity.iframeUrl
		if (!activity.launchUrl || !activity.queryParams) return null
		const url = new URL(activity.launchUrl)
		for (const [key, value] of Object.entries(activity.queryParams)) {
			url.searchParams.set(key, value)
		}
		return url.toString()
	}, [activity.iframeUrl, activity.launchUrl, activity.queryParams])

	// Compute target origin for postMessage (derive from actual iframe URL)
	const iframeOrigin = useMemo(() => {
		const url = activity.iframeUrl || activity.launchUrl
		if (!url) return null
		try {
			return new URL(url).origin
		} catch {
			return null
		}
	}, [activity.iframeUrl, activity.launchUrl])

	// Pop out: open iframe URL in a new tab
	const handlePopOut = useCallback(() => {
		if (iframeUrl) {
			window.open(iframeUrl, '_blank', 'noopener,noreferrer')
		}
	}, [iframeUrl])

	// Detect iframe reload for DevTools diagnostics
	const loadCountRef = useRef(0)
	const handleIframeLoad = useCallback(() => {
		loadCountRef.current++
		if (loadCountRef.current > 1) {
			// Iframe reloaded -- log for DevTools diagnostics
			onRpcRejected?.(`Iframe reloaded (load #${loadCountRef.current}). SDK will re-handshake.`,
				new MessageEvent('load'))
		}
	}, [onRpcRejected])

	// Wire the postMessage bridge
	useActivityRpcBridge({
		iframeRef,
		frameId: activity.frameId,
		instanceId: activity.instanceId,
		iframeOrigin,
		enabled: activity.isOpen && !!activity.launchUrl,
		onRejectedMessage: onRpcRejected
	})

	// Minimized drag state
	type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
	const [corner, setCorner] = useState<Corner>('bottom-right')
	const [offset, setOffset] = useState({ x: 0, y: 0 })
	const [isDragging, setIsDragging] = useState(false)
	const [isSnapping, setIsSnapping] = useState(false)
	const pendingCornerRef = useRef<Corner | null>(null)
	const minimizedRef = useRef<HTMLDivElement>(null)
	const dragRef = useRef<{
		startX: number
		startY: number
		lastX: number
		lastY: number
		lastTime: number
		velocityX: number
		velocityY: number
		hasMoved: boolean
	} | null>(null)

	const getCornerPos = useCallback((c: Corner) => {
		const parent = minimizedRef.current?.parentElement
		if (!parent) return { x: 0, y: 0 }
		const pw = parent.clientWidth
		const ph = parent.clientHeight
		return {
			x: c.includes('right') ? pw - 320 - 16 : 16,
			y: c.includes('bottom') ? ph - 180 - 16 : 16
		}
	}, [])

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		if ((e.target as HTMLElement).closest('button, a, img, iframe')) return
		e.preventDefault()
		setIsSnapping(false)
		pendingCornerRef.current = null
		setIsDragging(true)
		dragRef.current = {
			startX: e.clientX,
			startY: e.clientY,
			lastX: e.clientX,
			lastY: e.clientY,
			lastTime: Date.now(),
			velocityX: 0,
			velocityY: 0,
			hasMoved: false
		}
	}, [])

	useEffect(() => {
		if (!minimized) return

		const handleMouseMove = (e: MouseEvent) => {
			const drag = dragRef.current
			if (!drag) return

			const dx = e.clientX - drag.startX
			const dy = e.clientY - drag.startY

			if (!drag.hasMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
			drag.hasMoved = true

			const now = Date.now()
			const dt = now - drag.lastTime
			if (dt > 0) {
				drag.velocityX = (e.clientX - drag.lastX) / dt
				drag.velocityY = (e.clientY - drag.lastY) / dt
			}
			drag.lastX = e.clientX
			drag.lastY = e.clientY
			drag.lastTime = now

			setOffset({ x: dx, y: dy })
		}

		const handleMouseUp = () => {
			const drag = dragRef.current
			if (!drag) return
			dragRef.current = null
			setIsDragging(false)

			if (!drag.hasMoved) return

			const el = minimizedRef.current
			if (!el?.parentElement) {
				setOffset({ x: 0, y: 0 })
				return
			}

			const parent = el.parentElement.getBoundingClientRect()
			const rect = el.getBoundingClientRect()
			const centerX = rect.left + rect.width / 2 - parent.left
			const centerY = rect.top + rect.height / 2 - parent.top

			const flickWeight = 300
			const biasedX = centerX + drag.velocityX * flickWeight
			const biasedY = centerY + drag.velocityY * flickWeight

			const isLeft = biasedX < parent.width / 2
			const isTop = biasedY < parent.height / 2

			let newCorner: Corner
			if (isTop && isLeft) newCorner = 'top-left'
			else if (isTop) newCorner = 'top-right'
			else if (isLeft) newCorner = 'bottom-left'
			else newCorner = 'bottom-right'

			// Calculate target transform: offset needed from current corner to new corner
			const currentCornerPos = getCornerPos(corner)
			const newCornerPos = getCornerPos(newCorner)
			const targetOffset = {
				x: newCornerPos.x - currentCornerPos.x,
				y: newCornerPos.y - currentCornerPos.y
			}

			// Enable snap transition and animate to target
			pendingCornerRef.current = newCorner
			setIsSnapping(true)
			setOffset(targetOffset)
		}

		window.addEventListener('mousemove', handleMouseMove)
		window.addEventListener('mouseup', handleMouseUp)
		return () => {
			window.removeEventListener('mousemove', handleMouseMove)
			window.removeEventListener('mouseup', handleMouseUp)
		}
	}, [minimized, corner, getCornerPos])

	const handleTransitionEnd = useCallback(() => {
		if (pendingCornerRef.current) {
			setCorner(pendingCornerRef.current)
			pendingCornerRef.current = null
		}
		setOffset({ x: 0, y: 0 })
		setIsSnapping(false)
	}, [])

	// Render the iframe content (always mounted, never conditionally removed)
	// In playback mode, show a static indicator instead of an iframe
	const iframeContent = playbackMode ? (
		<div className={styles.placeholder}>
			<div className={styles.placeholderIcon} style={{ background: activity.iconColor || '#3a3a4a' }}>
				{activity.name?.[0] || '?'}
			</div>
			<div className={styles.placeholderName}>Activity (Playback)</div>
			<div style={{ color: '#b5bac1', fontSize: '12px', marginTop: '8px', textAlign: 'center', maxWidth: '300px', wordBreak: 'break-all' }}>
				{activity.launchUrl || 'No launch URL'}
			</div>
			{activity.instanceId && (
				<div style={{ color: '#72767d', fontSize: '11px', marginTop: '4px', fontFamily: 'monospace' }}>
					{activity.instanceId}
				</div>
			)}
		</div>
	) : iframeUrl ? (
		<iframe
			ref={iframeRef}
			className={styles.activityIframe}
			src={iframeUrl}
			title={activityName}
			allow="microphone; camera; clipboard-write; clipboard-read; fullscreen; autoplay; encrypted-media"
			sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-popups-to-escape-sandbox allow-downloads"
			referrerPolicy="origin"
			onLoad={handleIframeLoad}
		/>
	) : (
		<div className={styles.placeholder}>
			<div className={styles.placeholderIcon} style={{ background: activity.iconColor || '#3a3a4a' }}>
				{activity.name?.[0] || '?'}
			</div>
			<div className={styles.placeholderName}>{activityName}</div>
		</div>
	)

	if (minimized) {
		const cornerClass = {
			'top-left': styles.cornerTopLeft,
			'top-right': styles.cornerTopRight,
			'bottom-left': styles.cornerBottomLeft,
			'bottom-right': styles.cornerBottomRight
		}[corner]

		const className = [
			styles.minimized,
			cornerClass,
			isDragging ? styles.dragging : '',
			isSnapping ? styles.snapping : ''
		].filter(Boolean).join(' ')

		const posStyle: React.CSSProperties = (offset.x !== 0 || offset.y !== 0)
			? { transform: `translate(${offset.x}px, ${offset.y}px)` }
			: {}

		return (
			<div
				ref={minimizedRef}
				className={className}
				style={posStyle}
				onMouseDown={handleMouseDown}
				onTransitionEnd={handleTransitionEnd}
			>
				<div className={styles.minimizedContent} style={{ background: iframeUrl ? undefined : gradient }}>
					{iframeContent}
				</div>
				<div className={styles.minimizedHoverOverlay}>
					<div className={styles.minimizedTopBar}>
						<button className={styles.minimizedBackButton} type="button" onClick={onRestore}>
							<BackArrowIcon />
							<span className={styles.minimizedName}>{activityName}</span>
						</button>
					</div>
					<div className={styles.minimizedBottomBar}>
						{currentUser ? (
							<img
								className={styles.minimizedAvatar}
								src={getAvatarUrl(currentUser.id, currentUser.avatar, 24)}
								alt={currentUser.username}
								width={24}
								height={24}
							/>
						) : (
							<div />
						)}
						<button
							className={styles.minimizedLeaveButton}
							type="button"
							aria-label="Leave Activity"
							onClick={(e) => {
								e.stopPropagation()
								onDisconnect()
							}}
						>
							<LeaveIcon />
							<span className={styles.minimizedLeaveTooltip}>Leave Activity</span>
						</button>
					</div>
				</div>
			</div>
		)
	}

	return (
		<>
			<div ref={overlayRef} className={`${styles.overlay}${chatHidden ? ` ${styles.chatHidden}` : ''}`}>
				<div className={styles.panel}>
					<div className={styles.contentArea} style={{ background: iframeUrl ? undefined : gradient }}>
						{iframeContent}
					</div>

					<div className={styles.controlBar}>
						<div className={styles.controlBarLeft}>
							{currentUser && (
								<div className={styles.avatarWrapper}>
									<img
										className={styles.userAvatar}
										src={getAvatarUrl(currentUser.id, currentUser.avatar, 32)}
										alt={currentUser.username}
										width={32}
										height={32}
									/>
									<span role="tooltip" className={styles.avatarTooltip}>
										{currentUser.username}
									</span>
								</div>
							)}
						</div>

						<div className={styles.controlBarCenter}>
							<div className={styles.controlGroup}>
								<div className={styles.buttonTooltipWrapper}>
									<button className={styles.controlButton} type="button" aria-label={chatHidden ? 'Show Chat' : 'Hide Chat'} onClick={() => setChatHidden((h) => !h)}>
										<div className={styles.controlButtonInner}>
											{chatHidden ? <ChevronUpIcon /> : <ChevronDownIcon />}
										</div>
									</button>
									<span role="tooltip" className={styles.buttonTooltip}>{chatHidden ? 'Show Chat' : 'Hide Chat'}</span>
								</div>
								<div className={styles.buttonTooltipWrapper}>
									<button className={styles.controlButton} type="button" aria-label="Minimize Activity" onClick={onMinimize}>
										<div className={styles.controlButtonInner}>
											<MinimizeIcon />
										</div>
									</button>
									<span role="tooltip" className={styles.buttonTooltip}>Minimize Activity</span>
								</div>
							</div>
							<div className={styles.buttonTooltipWrapper}>
								<button className={styles.disconnectButton} type="button" aria-label="Leave Activity" onClick={onDisconnect}>
									<LeaveIcon />
								</button>
								<span role="tooltip" className={styles.buttonTooltip}>Leave Activity</span>
							</div>
						</div>

						<div className={styles.controlBarRight}>
							<div className={styles.buttonTooltipWrapper}>
								<button className={styles.controlButton} type="button" aria-label="Pop Out" onClick={handlePopOut}>
									<PopoutIcon />
								</button>
								<span role="tooltip" className={styles.buttonTooltip}>Pop Out</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Auth consent modal overlay */}
			<AuthConsentModal
				visible={!!authorizeRequest}
				applicationName={activity?.name ?? `App ${activity?.applicationId ?? 'Unknown'}`}
				applicationId={authorizeRequest?.client_id ?? ''}
				scopes={authorizeRequest?.scopes ?? []}
				onApprove={onAuthorizeApprove ?? (() => {})}
				onDeny={onAuthorizeDeny ?? (() => {})}
			/>
		</>
	)
}

function ChevronDownIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
			<path fill="currentColor" d="M3.3 8.3a1 1 0 0 1 1.4 0l7.3 7.29 7.3-7.3a1 1 0 1 1 1.4 1.42l-8 8a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1 0-1.42Z" />
		</svg>
	)
}

function ChevronUpIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
			<path fill="currentColor" d="M3.3 15.7a1 1 0 0 0 1.4 0l7.3-7.29 7.3 7.3a1 1 0 1 0 1.4-1.42l-8-8a1 1 0 0 0-1.4 0l-8 8a1 1 0 0 0 0 1.42Z" />
		</svg>
	)
}

function MinimizeIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
			<path fill="currentColor" d="M15 4v3.59l5.3-5.3a1 1 0 1 1 1.4 1.42L16.42 9H20a1 1 0 1 1 0 2h-6a1 1 0 0 1-1-1V4a1 1 0 1 1 2 0ZM9 16.41l-5.3 5.3a1 1 0 0 1-1.4-1.42L7.58 15H4a1 1 0 1 1 0-2h6a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-3.59Z" />
		</svg>
	)
}

function LeaveIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
			<path fill="currentColor" d="M9 12a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1Z" />
			<path fill="currentColor" fillRule="evenodd" d="M2.75 3.02A3 3 0 0 1 5 2h10a3 3 0 0 1 3 3v7.64c0 .44-.55.7-.95.55a3 3 0 0 0-3.17 4.93l.02.03a.5.5 0 0 1-.35.85h-.05a.5.5 0 0 0-.5.5 2.5 2.5 0 0 1-3.68 2.2l-5.8-3.09A3 3 0 0 1 2 16V5a3 3 0 0 1 .76-1.98Zm1.3 1.95A.04.04 0 0 0 4 5v11c0 .36.2.68.49.86l5.77 3.08a.5.5 0 0 0 .74-.44V8.02a.5.5 0 0 0-.32-.46l-6.63-2.6Z" clipRule="evenodd" />
			<path fill="currentColor" d="M15.3 16.7a1 1 0 0 1 1.4-1.4l4.3 4.29V16a1 1 0 1 1 2 0v6a1 1 0 0 1-1 1h-6a1 1 0 1 1 0-2h3.59l-4.3-4.3Z" />
		</svg>
	)
}

function PopoutIcon() {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
			<path fill="currentColor" d="M15 2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V4.41l-4.3 4.3a1 1 0 1 1-1.4-1.42L19.58 3H16a1 1 0 0 1-1-1Z" />
			<path fill="currentColor" d="M5 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-6a1 1 0 1 0-2 0v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6a1 1 0 1 0 0-2H5Z" />
		</svg>
	)
}

function BackArrowIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
			<path fill="currentColor" d="M20 11H7.41l3.3-3.29a1 1 0 1 0-1.42-1.42l-5 5a1 1 0 0 0 0 1.42l5 5a1 1 0 0 0 1.42-1.42L7.41 13H20a1 1 0 0 0 0-2Z" />
		</svg>
	)
}
