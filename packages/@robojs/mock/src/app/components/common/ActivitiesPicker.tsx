import { useEffect, useMemo, useState } from 'react'
import { DropdownContainer, PrimaryButton, useDropdownPosition } from '../base'
import styles from './ActivitiesPicker.module.css'

interface ActivitiesPickerProps {
	onClose: () => void
	position?: { x: number; y: number }
}

export const ACTIVITIES_PICKER_WIDTH = 500
export const ACTIVITIES_PICKER_HEIGHT = 680

interface Activity {
	id: string
	name: string
	description: string
	iconColor: string
	bannerGradient: string
}

const PROMOTED_ACTIVITIES: Activity[] = [
	{
		id: 'word-guess',
		name: 'Word Guess',
		description: 'Can you crack the code? You have 6 chances to guess a 5-letter word each day.',
		iconColor: '#4a6243',
		bannerGradient: 'linear-gradient(135deg, #3a3832 0%, #363430 50%, #4a6243 100%)'
	},
	{
		id: 'enchanted-grove',
		name: 'Enchanted Grove',
		description: 'Garden with friends! Grow your own unique and magical garden, collect rare pets.',
		iconColor: '#6b5438',
		bannerGradient: 'linear-gradient(135deg, #3a4550 0%, #435045 40%, #6b5438 100%)'
	},
	{
		id: 'harvest-craft',
		name: 'Harvest Craft',
		description: 'Farm, merge, grow and expand your land!',
		iconColor: '#556846',
		bannerGradient: 'linear-gradient(135deg, #556846 0%, #476048 40%, #635c3e 100%)'
	},
	{
		id: 'stream-party',
		name: 'Stream Party',
		description: 'Create and watch shared video playlists with your friends.',
		iconColor: '#6b3a3a',
		bannerGradient: 'linear-gradient(135deg, #3e3c3c 0%, #3b3a3a 50%, #4a3838 100%)'
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
				bannerGradient: ''
			},
			{
				id: 'daily-letter-spin',
				name: 'Daily Letter Spin',
				description: 'Spin the wheel and find hidden words in this daily word puzzle.',
				iconColor: '#6b5535',
				bannerGradient: ''
			},
			{
				id: 'color-crush',
				name: 'Color Crush',
				description: 'Immerse yourself in a world full of vibrant colors and mind-bending puzzles.',
				iconColor: '#6b3a4a',
				bannerGradient: ''
			},
			{
				id: 'hex-puzzle',
				name: 'Hex Puzzle Adventure',
				description: 'A hex stacking puzzle game. Use strategic thinking to solve the levels.',
				iconColor: '#3a5558',
				bannerGradient: ''
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
				bannerGradient: ''
			},
			{
				id: 'wild-8s',
				name: 'Wild 8s',
				description: 'Be the first to zero cards by swapping hands, skipping players, and reversing turns.',
				iconColor: '#6b4438',
				bannerGradient: ''
			},
			{
				id: 'twenty-one',
				name: 'Twenty One',
				description: 'A classic card game where you try to hit 21. Play with up to 8 people.',
				iconColor: '#2e2e2e',
				bannerGradient: ''
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
				bannerGradient: ''
			},
			{
				id: 'chillwave',
				name: 'Chillwave',
				description: 'Vibe with your friends with lofi music and a curated ambience.',
				iconColor: '#503858',
				bannerGradient: ''
			},
			{
				id: 'sketch-pad',
				name: 'Sketch Pad',
				description: 'Draw, upload images, write, and use GIFs to create virtually anything.',
				iconColor: '#3a5068',
				bannerGradient: ''
			}
		]
	}
]

const RECENT_ACTIVITIES = [PROMOTED_ACTIVITIES[0]]

export function ActivitiesPicker({ onClose, position }: ActivitiesPickerProps) {
	const [search, setSearch] = useState('')

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

	// Close on Escape
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [onClose])

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
						{/* Recents */}
						{filteredRecents.length > 0 && (
							<>
								<div className={styles.sectionHeader}>
									<span className={styles.sectionTitle}>Recents</span>
								</div>
								<div className={styles.recentsRow}>
									{filteredRecents.map((activity) => (
										<button key={activity.id} className={styles.recentItem} type="button">
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
										<div key={activity.id} className={styles.activityCard} role="button" tabIndex={0}>
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
										<button className={styles.viewMore} type="button">View More</button>
									)}
								</div>
								<div className={styles.sectionContainer}>
									{category.items.map((activity) => (
										<div key={activity.id} className={styles.listItem} role="button" tabIndex={0}>
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
			</DropdownContainer>
		</div>
	)
}
