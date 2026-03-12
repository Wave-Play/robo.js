'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { ChangelogData, Release, PackageRelease } from '@/data/changelog'
import { ChangelogFilterBar } from '@/components/changelog/changelog-filter-bar'
import { ChangelogTimeline } from '@/components/changelog/changelog-timeline'
import { ChangelogEmptyState } from '@/components/changelog/changelog-empty-state'

interface ChangelogContentProps {
	changelog: ChangelogData
	allChangesCount: number
}

export function ChangelogContent({ changelog, allChangesCount }: ChangelogContentProps) {
	const [search, setSearch] = useState('')
	const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set())
	const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
	const [selectedImpacts, setSelectedImpacts] = useState<Set<string>>(new Set())

	const togglePackage = useCallback((name: string) => {
		setSelectedPackages((prev) => {
			const next = new Set(prev)
			if (next.has(name)) {
				next.delete(name)
			} else {
				next.add(name)
			}
			return next
		})
	}, [])

	const toggleType = useCallback((type: string) => {
		setSelectedTypes((prev) => {
			const next = new Set(prev)
			if (next.has(type)) {
				next.delete(type)
			} else {
				next.add(type)
			}
			return next
		})
	}, [])

	const toggleImpact = useCallback((impact: string) => {
		setSelectedImpacts((prev) => {
			const next = new Set(prev)
			if (next.has(impact)) {
				next.delete(impact)
			} else {
				next.add(impact)
			}
			return next
		})
	}, [])

	const clearFilters = useCallback(() => {
		setSearch('')
		setSelectedPackages(new Set())
		setSelectedTypes(new Set())
		setSelectedImpacts(new Set())
	}, [])

	const hasActiveFilters = search || selectedPackages.size > 0 || selectedTypes.size > 0 || selectedImpacts.size > 0

	// Once the user touches any filter, permanently skip whileInView scroll-reveal
	// to prevent blank spots from IntersectionObserver timing issues on mount
	const hasInteractedRef = useRef(false)
	if (hasActiveFilters) {
		hasInteractedRef.current = true
	}

	const { filteredReleases, totalChanges } = useMemo(() => {
		const searchLower = search.toLowerCase()

		const filtered = changelog.releases
			.map((release): Release | null => {
				const filteredPackages = release.packages
					.filter((pkg) => {
						if (selectedPackages.size > 0 && !selectedPackages.has(pkg.name)) {
							return false
						}
						if (selectedImpacts.size > 0 && !selectedImpacts.has(pkg.impact)) {
							return false
						}
						return true
					})
					.map((pkg): PackageRelease => {
						const filteredChanges = pkg.changes.filter((entry) => {
							if (selectedTypes.size > 0) {
								const matchesType = selectedTypes.has(entry.type) || (selectedTypes.has('breaking') && entry.breaking)
								if (!matchesType) return false
							}
							if (searchLower) {
								const matchesMessage = entry.message.toLowerCase().includes(searchLower)
								const matchesScope = entry.scope?.toLowerCase().includes(searchLower) ?? false
								const matchesPackage = pkg.name.toLowerCase().includes(searchLower) || pkg.displayName.toLowerCase().includes(searchLower)
								if (!matchesMessage && !matchesScope && !matchesPackage) return false
							}
							return true
						})

						return { ...pkg, changes: filteredChanges }
					})
					.filter((pkg) => pkg.changes.length > 0)

				if (filteredPackages.length === 0) return null

				return { date: release.date, packages: filteredPackages }
			})
			.filter((r): r is Release => r !== null)

		const total = filtered.reduce(
			(sum, r) => sum + r.packages.reduce((s, p) => s + p.changes.length, 0),
			0
		)

		return { filteredReleases: filtered, totalChanges: total }
	}, [search, selectedPackages, selectedTypes, selectedImpacts, changelog.releases])

	return (
		<>
			{/* Filters — fade in */}
			<motion.div
				className="relative z-50 mb-8"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4, delay: 0.2 }}
			>
				<ChangelogFilterBar
					packages={changelog.packages}
					search={search}
					onSearchChange={setSearch}
					selectedPackages={selectedPackages}
					onTogglePackage={togglePackage}
					selectedTypes={selectedTypes}
					onToggleType={toggleType}
					selectedImpacts={selectedImpacts}
					onToggleImpact={toggleImpact}
				/>
			</motion.div>

			{/* Clear filters link */}
			<AnimatePresence>
				{hasActiveFilters && filteredReleases.length > 0 && (
					<motion.div
						className="text-center mb-4"
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: 'auto' }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.2 }}
					>
						<button
							onClick={clearFilters}
							className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
						>
							Clear all filters
						</button>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Results count */}
			<motion.div
				className="text-center mb-8"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 0.3 }}
			>
				<p className="text-sm text-muted-foreground">
					Showing {totalChanges} of {allChangesCount} changes across {filteredReleases.length} releases
				</p>
			</motion.div>

			{/* Timeline or Empty State — crossfade on filter change */}
			<div className="max-w-4xl mx-auto">
				<AnimatePresence mode="wait">
					{filteredReleases.length > 0 ? (
						<motion.div
							key="timeline"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.25 }}
						>
							<ChangelogTimeline releases={filteredReleases} immediate={hasInteractedRef.current} />
						</motion.div>
					) : (
						<motion.div
							key="empty"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.25 }}
						>
							<ChangelogEmptyState onClear={clearFilters} />
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</>
	)
}
