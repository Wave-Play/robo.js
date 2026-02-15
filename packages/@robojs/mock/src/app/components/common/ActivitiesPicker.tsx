import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DropdownContainer, PrimaryButton, useDropdownPosition } from '../base'
import styles from './ActivitiesPicker.module.css'

interface ActivitiesPickerProps {
	onClose: () => void
	position?: { x: number; y: number }
	onPlayActivity?: (activity: Activity) => void
}

export const ACTIVITIES_PICKER_WIDTH = 500
export const ACTIVITIES_PICKER_HEIGHT = 680

export interface Activity {
	id: string
	name: string
	description: string
	iconColor: string
	bannerGradient: string
	tags?: string[]
	maxPlayers?: string
	launchUrl?: string
	applicationId?: string
}

const PROMOTED_ACTIVITIES: Activity[] = [
	{
		id: 'word-guess',
		name: 'Word Guess',
		description: 'Can you crack the code? You have 6 chances to guess a 5-letter word each day.',
		iconColor: '#4a6243',
		bannerGradient: 'linear-gradient(135deg, #3a3832 0%, #363430 50%, #4a6243 100%)',
		tags: ['Word game', 'Daily'],
		maxPlayers: 'Unlimited'
	},
	{
		id: 'enchanted-grove',
		name: 'Enchanted Grove',
		description: 'Garden with friends! Grow your own unique and magical garden, collect rare pets.',
		iconColor: '#6b5438',
		bannerGradient: 'linear-gradient(135deg, #3a4550 0%, #435045 40%, #6b5438 100%)',
		tags: ['Simulation', 'Multiplayer'],
		maxPlayers: '20'
	},
	{
		id: 'harvest-craft',
		name: 'Harvest Craft',
		description: 'Farm, merge, grow and expand your land!',
		iconColor: '#556846',
		bannerGradient: 'linear-gradient(135deg, #556846 0%, #476048 40%, #635c3e 100%)',
		tags: ['Simulation', 'Casual'],
		maxPlayers: 'Unlimited'
	},
	{
		id: 'stream-party',
		name: 'Stream Party',
		description: 'Create and watch shared video playlists with your friends.',
		iconColor: '#6b3a3a',
		bannerGradient: 'linear-gradient(135deg, #3e3c3c 0%, #3b3a3a 50%, #4a3838 100%)',
		tags: ['Watch together', 'Social'],
		maxPlayers: 'Unlimited'
	}
]

const CATEGORIES: Array<{
	label: string
	hasViewMore: boolean
	items: Activity[]
}> = [
	{
		label: 'Puzzle Games',
		hasViewMore: true,
		items: [
			{
				id: 'number-grid',
				name: 'Number Grid Together',
				description: 'Dive into Number Grid Together — your ultimate number puzzle adventure!',
				iconColor: '#3e4460',
				bannerGradient: '',
				tags: ['Puzzle', 'Multiplayer'],
				maxPlayers: '8'
			},
			{
				id: 'daily-letter-spin',
				name: 'Daily Letter Spin',
				description: 'Spin the wheel and find hidden words in this daily word puzzle.',
				iconColor: '#6b5535',
				bannerGradient: '',
				tags: ['Word game', 'Daily'],
				maxPlayers: 'Unlimited'
			},
			{
				id: 'color-crush',
				name: 'Color Crush',
				description: 'Immerse yourself in a world full of vibrant colors and mind-bending puzzles.',
				iconColor: '#6b3a4a',
				bannerGradient: '',
				tags: ['Puzzle', 'Casual'],
				maxPlayers: 'Unlimited'
			},
			{
				id: 'hex-puzzle',
				name: 'Hex Puzzle Adventure',
				description: 'A hex stacking puzzle game. Use strategic thinking to solve the levels.',
				iconColor: '#3a5558',
				bannerGradient: '',
				tags: ['Puzzle', 'Strategy'],
				maxPlayers: '4'
			}
		]
	},
	{
		label: 'Card Games',
		hasViewMore: false,
		items: [
			{
				id: 'card-showdown',
				name: 'Card Showdown',
				description: "A classic hold 'em style card game where you can prove your card prowess!",
				iconColor: '#436048',
				bannerGradient: '',
				tags: ['Card game', 'Multiplayer'],
				maxPlayers: '8'
			},
			{
				id: 'wild-8s',
				name: 'Wild 8s',
				description: 'Be the first to zero cards by swapping hands, skipping players, and reversing turns.',
				iconColor: '#6b4438',
				bannerGradient: '',
				tags: ['Card game', 'Party'],
				maxPlayers: '10'
			},
			{
				id: 'twenty-one',
				name: 'Twenty One',
				description: 'A classic card game where you try to hit 21. Play with up to 8 people.',
				iconColor: '#2e2e2e',
				bannerGradient: '',
				tags: ['Card game', 'Classic'],
				maxPlayers: '8'
			}
		]
	},
	{
		label: 'Chill Together',
		hasViewMore: true,
		items: [
			{
				id: 'stream-party-list',
				name: 'Stream Party',
				description: 'Create and watch shared video playlists with your friends.',
				iconColor: '#6b3a3a',
				bannerGradient: '',
				tags: ['Watch together', 'Social'],
				maxPlayers: 'Unlimited'
			},
			{
				id: 'chillwave',
				name: 'Chillwave',
				description: 'Vibe with your friends with lofi music and a curated ambience.',
				iconColor: '#503858',
				bannerGradient: '',
				tags: ['Music', 'Social'],
				maxPlayers: 'Unlimited'
			},
			{
				id: 'sketch-pad',
				name: 'Sketch Pad',
				description: 'Draw, upload images, write, and use GIFs to create virtually anything.',
				iconColor: '#3a5068',
				bannerGradient: '',
				tags: ['Creative', 'Social'],
				maxPlayers: '16'
			}
		]
	}
]

const RECENT_ACTIVITIES = [PROMOTED_ACTIVITIES[0]]

export function ActivitiesPicker({ onClose, position, onPlayActivity }: ActivitiesPickerProps) {
	const [search, setSearch] = useState('')
	const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
	const [showFullDescription, setShowFullDescription] = useState(false)
	const displayedActivity = useRef<Activity | null>(null)

	// Custom URL state
	const [customUrl, setCustomUrl] = useState('')
	const [customAppId, setCustomAppId] = useState('')

	// Persist custom URL and App ID in localStorage
	useEffect(() => {
		const saved = localStorage.getItem('mock_custom_activity_url')
		if (saved) setCustomUrl(saved)
		const savedAppId = localStorage.getItem('mock_custom_activity_app_id')
		if (savedAppId) setCustomAppId(savedAppId)
	}, [])

	useEffect(() => {
		if (customUrl) localStorage.setItem('mock_custom_activity_url', customUrl)
	}, [customUrl])

	useEffect(() => {
		if (customAppId) localStorage.setItem('mock_custom_activity_app_id', customAppId)
	}, [customAppId])

	// Detected activities from project detection
	const [detectedActivities, setDetectedActivities] = useState<Activity[]>([])
	const [isDetecting, setIsDetecting] = useState(true)

	const getApiPrefix = useCallback(() => {
		const pathname = window.location.pathname
		const stageIndex = pathname.indexOf('/stage')
		return stageIndex !== -1 ? pathname.slice(0, stageIndex) : ''
	}, [])

	// Fetch project detection on mount
	useEffect(() => {
		const apiPrefix = getApiPrefix()
		fetch(`${apiPrefix}/api/control/project`)
			.then((res) => res.json())
			.then((data: {
				hasEmbeddedAppSdk: boolean
				detectedMappingsFile: {
					valid: boolean
					activities?: Array<{
						id: string
						name: string
						application_id: string
						launch_url: string
					}>
				}
				suggestedLaunchUrl: string | null
				suggestedApplicationId: string | null
			}) => {
				const activities: Activity[] = []

				// Add activities from mappings file
				if (data.detectedMappingsFile.valid && data.detectedMappingsFile.activities) {
					for (const a of data.detectedMappingsFile.activities) {
						activities.push({
							id: `detected-${a.id}`,
							name: a.name,
							description: a.launch_url,
							iconColor: '#43b581',
							bannerGradient: '',
							launchUrl: a.launch_url,
							applicationId: a.application_id,
							tags: ['Local']
						})
					}
				}

				// If SDK detected but no mappings file activities, add a generic entry
				if (activities.length === 0 && data.hasEmbeddedAppSdk && data.suggestedLaunchUrl) {
					activities.push({
						id: 'detected-local',
						name: 'Local Activity',
						description: data.suggestedLaunchUrl,
						iconColor: '#43b581',
						bannerGradient: '',
						launchUrl: data.suggestedLaunchUrl,
						applicationId: data.suggestedApplicationId ?? '1234567890',
						tags: ['Local', 'Auto-detected']
					})
				}

				setDetectedActivities(activities)
			})
			.catch(() => {
				// Silently fail -- detection is best-effort
			})
			.finally(() => setIsDetecting(false))
	}, [getApiPrefix])

	// Auto-populate custom URL and App ID from detected activities
	useEffect(() => {
		if (detectedActivities.length > 0 && !customUrl) {
			const first = detectedActivities[0]
			if (first.launchUrl) setCustomUrl(first.launchUrl)
			if (first.applicationId) setCustomAppId(first.applicationId)
		}
	}, [detectedActivities]) // eslint-disable-line react-hooks/exhaustive-deps

	// Keep displayed activity in sync, but preserve it during slide-out
	if (selectedActivity) {
		displayedActivity.current = selectedActivity
	}

	const centerPosition = useMemo(() => {
		if (position) return position
		if (typeof window === 'undefined') return { x: 0, y: 0 }
		return {
			x: Math.max(16, (window.innerWidth - ACTIVITIES_PICKER_WIDTH) / 2),
			y: Math.max(16, (window.innerHeight - ACTIVITIES_PICKER_HEIGHT) / 2)
		}
	}, [position])

	const { dropdownRef, adjustedPosition, isPositioned } = useDropdownPosition({
		position: centerPosition,
		viewportPadding: 16
	})

	// Reset showFullDescription when selectedActivity changes
	useEffect(() => {
		setShowFullDescription(false)
	}, [selectedActivity])

	// Filter activities by search
	const filteredPromoted = useMemo(() => {
		if (!search) return PROMOTED_ACTIVITIES
		const q = search.toLowerCase()
		return PROMOTED_ACTIVITIES.filter((a) => a.name.toLowerCase().includes(q))
	}, [search])

	const filteredCategories = useMemo(() => {
		if (!search) return CATEGORIES
		const q = search.toLowerCase()
		return CATEGORIES.map((cat) => ({
			...cat,
			items: cat.items.filter((a) => a.name.toLowerCase().includes(q))
		})).filter((cat) => cat.items.length > 0)
	}, [search])

	const filteredRecents = useMemo(() => {
		if (!search) return RECENT_ACTIVITIES
		const q = search.toLowerCase()
		return RECENT_ACTIVITIES.filter((a) => a.name.toLowerCase().includes(q))
	}, [search])

	// Close on click outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				onClose()
			}
		}

		document.addEventListener('mousedown', handleClickOutside, true)
		return () => document.removeEventListener('mousedown', handleClickOutside, true)
	}, [onClose, dropdownRef])

	// Escape: detail view → list, list → close
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				if (selectedActivity) {
					setSelectedActivity(null)
				} else {
					onClose()
				}
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [onClose, selectedActivity])

	const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget) {
			onClose()
		}
	}

	return (
		<div className={styles.overlay} onClick={handleOverlayClick}>
			<DropdownContainer
				ref={dropdownRef}
				role="dialog"
				aria-label="Application Launcher"
				className={styles.picker}
				position="fixed"
				coordinates={adjustedPosition}
				isPositioned={isPositioned}
			>
				<div className={styles.container}>
					<div className={`${styles.slideWrapper} ${selectedActivity ? styles.slideToDetail : ''}`}>
						{/* List panel */}
						<div className={styles.slidePanel}>
							{/* Search */}
							<div className={styles.searchSection}>
								<div className={styles.searchWrapper}>
									<svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none">
										<path
											fill="currentColor"
											fillRule="evenodd"
											d="M15.62 17.03a9 9 0 1 1 1.41-1.41l4.68 4.67a1 1 0 0 1-1.42 1.42l-4.67-4.68ZM17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
											clipRule="evenodd"
										/>
									</svg>
									<input
										className={styles.searchInput}
										type="text"
										placeholder="Search Apps & Commands"
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
								</div>
							</div>

							{/* Scrollable content */}
							<div className={styles.content}>
								{/* Custom Activity */}
								<div className={styles.sectionHeader}>
									<span className={styles.sectionTitle}>Custom Activity</span>
								</div>
								<div className={styles.customUrlSection}>
									<div className={styles.customUrlRow}>
										<input
											className={styles.customUrlInput}
											type="url"
											placeholder="Activity URL (e.g., http://localhost:5173)"
											value={customUrl}
											onChange={(e) => setCustomUrl(e.target.value)}
										/>
									</div>
									<div className={styles.customUrlRow}>
										<input
											className={styles.customAppIdInput}
											type="text"
											placeholder="Application ID"
											value={customAppId}
											onChange={(e) => setCustomAppId(e.target.value)}
										/>
										<PrimaryButton
											disabled={!customUrl.trim()}
											onClick={() => {
												if (onPlayActivity && customUrl.trim()) {
													onPlayActivity({
														id: 'custom',
														name: 'Custom Activity',
														description: customUrl.trim(),
														iconColor: '#5865f2',
														bannerGradient: '',
														launchUrl: customUrl.trim(),
														applicationId: customAppId.trim() || '1234567890'
													})
													onClose()
												}
											}}
										>
											Play
										</PrimaryButton>
									</div>
								</div>

								{/* Detected Activities */}
								{!isDetecting && detectedActivities.length > 0 && (
									<>
										<div className={styles.sectionHeader}>
											<span className={styles.sectionTitle}>Detected</span>
										</div>
										<div className={styles.sectionContainer}>
											{detectedActivities.map((act) => (
												<div
													key={act.id}
													className={styles.listItem}
													role="button"
													tabIndex={0}
													onClick={() => {
														if (onPlayActivity) {
															onPlayActivity(act)
														}
														onClose()
													}}
												>
													<div className={styles.listIcon} style={{ background: act.iconColor }}>
														{act.name[0]}
													</div>
													<div className={styles.listDetails}>
														<div className={styles.listName}>{act.name}</div>
														<div className={styles.listDescription}>{act.description}</div>
													</div>
												</div>
											))}
										</div>
									</>
								)}

								{/* Recents */}
								{filteredRecents.length > 0 && (
									<>
										<div className={styles.sectionHeader}>
											<span className={styles.sectionTitle}>Recents</span>
										</div>
										<div className={styles.recentsRow}>
											{filteredRecents.map((activity) => (
												<button
													key={activity.id}
													className={styles.recentItem}
													type="button"
													onClick={() => setSelectedActivity(activity)}
												>
													<div className={styles.recentIcon} style={{ background: activity.iconColor }}>
														{activity.name[0]}
													</div>
													<span className={styles.recentName}>{activity.name}</span>
												</button>
											))}
										</div>
									</>
								)}

								{/* Promoted */}
								{filteredPromoted.length > 0 && (
									<>
										<div className={styles.sectionHeader}>
											<span className={styles.sectionTitle}>Promoted</span>
										</div>
										<div className={styles.promotedGrid}>
											{filteredPromoted.map((activity) => (
												<div
													key={activity.id}
													className={styles.activityCard}
													role="button"
													tabIndex={0}
													onClick={() => setSelectedActivity(activity)}
												>
													<div className={styles.cardBanner} style={{ background: activity.bannerGradient }} />
													<div className={styles.cardInfo}>
														<div className={styles.cardIcon} style={{ background: activity.iconColor }}>
															{activity.name[0]}
														</div>
														<div className={styles.cardText}>
															<div className={styles.cardName}>{activity.name}</div>
															<div className={styles.cardDescription}>{activity.description}</div>
														</div>
													</div>
												</div>
											))}
										</div>
									</>
								)}

								{/* Category sections */}
								{filteredCategories.map((category) => (
									<div key={category.label}>
										<div className={styles.sectionHeader}>
											<span className={styles.sectionTitle}>{category.label}</span>
											{category.hasViewMore && (
												<button className={styles.viewMore} type="button">
													View More
												</button>
											)}
										</div>
										<div className={styles.sectionContainer}>
											{category.items.map((activity) => (
												<div
													key={activity.id}
													className={styles.listItem}
													role="button"
													tabIndex={0}
													onClick={() => setSelectedActivity(activity)}
												>
													<div className={styles.listIcon} style={{ background: activity.iconColor }}>
														{activity.name[0]}
													</div>
													<div className={styles.listDetails}>
														<div className={styles.listName}>{activity.name}</div>
														<div className={styles.listDescription}>{activity.description}</div>
													</div>
												</div>
											))}
										</div>
									</div>
								))}

								{/* Footer CTA */}
								<div className={styles.footerCard}>
									<div className={styles.footerBody}>
										<div className={styles.footerHeading}>Want to build an Activity?</div>
										<div className={styles.footerText}>
											Learn how to create, test, and publish your own Discord Activity.
										</div>
									</div>
									<PrimaryButton
										href="https://robojs.dev/discord-activities/overview"
										target="_blank"
										rel="noopener noreferrer"
									>
										Learn More
									</PrimaryButton>
								</div>
							</div>
						</div>

						{/* Detail panel */}
						<div className={styles.slidePanel}>
							{displayedActivity.current && (
								<div className={styles.detailContent}>
									{/* Hero banner area (dark background) */}
									<div className={styles.detailHeroBanner}>
										{/* Top bar */}
										<div className={styles.detailTopBar}>
											<button
												className={styles.detailCircleButton}
												type="button"
												onClick={() => setSelectedActivity(null)}
												aria-label="Back"
											>
												<ArrowLeftIcon />
											</button>
											<div className={styles.detailTopBarActions}>
												<button className={styles.detailCircleButton} type="button" aria-label="Copy link">
													<LinkIcon />
												</button>
												<button className={styles.detailCircleButton} type="button" aria-label="More options">
													<MoreIcon />
												</button>
											</div>
										</div>

										{/* App icon */}
										<div className={styles.detailAppIcon} style={{ background: displayedActivity.current.iconColor }}>
											{displayedActivity.current.name[0]}
										</div>
									</div>

									{/* Card: preview + info + buttons */}
									<div className={styles.detailCard}>
										{/* Preview banner */}
										<div
											className={styles.detailPreview}
											style={{ background: getBannerGradient(displayedActivity.current) }}
										/>

										{/* Body content */}
										<div className={styles.detailBody}>
											{/* App name */}
											<div className={styles.detailAppName}>{displayedActivity.current.name}</div>

											{/* Tags row */}
											{(displayedActivity.current.tags || displayedActivity.current.maxPlayers) && (
												<div className={styles.detailTags}>
													{displayedActivity.current.maxPlayers && (
														<span className={styles.detailTag}>
															<PeopleIcon />
															{displayedActivity.current.maxPlayers}
														</span>
													)}
													{displayedActivity.current.tags?.map((tag) => (
														<span key={tag} className={styles.detailTag}>
															{tag}
														</span>
													))}
												</div>
											)}

											{/* Description */}
											<div className={styles.detailDescriptionWrap}>
												<div
													className={
														showFullDescription
															? `${styles.detailDescription} ${styles.detailDescriptionExpanded}`
															: styles.detailDescription
													}
												>
													{displayedActivity.current.description}
												</div>
												{!showFullDescription && (
													<button
														className={styles.showMoreButton}
														type="button"
														onClick={() => setShowFullDescription(true)}
													>
														Show More <ChevronDownSmallIcon />
													</button>
												)}
											</div>

											{/* Action buttons */}
											<div className={styles.detailActions}>
												<PrimaryButton onClick={() => {
													if (onPlayActivity && displayedActivity.current) {
														onPlayActivity(displayedActivity.current)
													}
													onClose()
												}}>Play</PrimaryButton>
												<button className={styles.launchDmButton} type="button">
													Launch in DM
												</button>
											</div>
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</DropdownContainer>
		</div>
	)
}

function getBannerGradient(activity: Activity): string {
	if (activity.bannerGradient) return activity.bannerGradient
	return `linear-gradient(135deg, #2a2a2e 0%, ${activity.iconColor} 100%)`
}

function ArrowLeftIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
			<path
				fill="currentColor"
				d="M7.53 12.53a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 0-1.06l4-4a.75.75 0 0 1 1.06 1.06L4.81 7.25H13a.75.75 0 0 1 0 1.5H4.81l2.72 2.72a.75.75 0 0 1 0 1.06Z"
			/>
		</svg>
	)
}

function LinkIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24">
			<path
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-.5.5"
			/>
			<path
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l.5-.5"
			/>
		</svg>
	)
}

function MoreIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
			<circle cx="3" cy="8" r="1.5" fill="currentColor" />
			<circle cx="8" cy="8" r="1.5" fill="currentColor" />
			<circle cx="13" cy="8" r="1.5" fill="currentColor" />
		</svg>
	)
}

function PeopleIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
			<path
				fill="currentColor"
				d="M5.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1 12.5C1 10.015 3.015 8 5.5 8S10 10.015 10 12.5V13a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-.5Z"
			/>
			<path
				fill="currentColor"
				d="M10.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM11 12.5V13a2 2 0 0 1-.07.5H14a1 1 0 0 0 1-1v-.5C15 10.015 12.985 8 10.5 8c-.553 0-1.08.09-1.575.256A5.98 5.98 0 0 1 11 12.5Z"
			/>
		</svg>
	)
}

function ChevronDownSmallIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
			<path fill="currentColor" d="M4.47 6.47a.75.75 0 0 1 1.06 0L8 8.94l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
		</svg>
	)
}
