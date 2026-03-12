'use client'

import { useState, useRef, useEffect } from 'react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { Check, Search, SlidersHorizontal, X } from 'lucide-react'
import {
	Activity, BarChart, Blocks, Brain, Bug, DiamondNodes, Gift,
	Hourglass, Lock, Bandage, Milestone, Server, Shield,
	RefreshSync, Translate, Trophy, Zap
} from '@/components/ui/icons'
import { AnimatedIconWrapper } from '@/components/ui/icons/animated-icon-wrapper'

// Cycling color palette for package chips
const packageChipPalette = [
	'border-emerald-400/60 bg-emerald-500/10 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]',
	'border-cyan-400/60 bg-cyan-500/10 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.3)]',
	'border-indigo-400/60 bg-indigo-500/10 text-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.3)]',
	'border-orange-400/60 bg-orange-500/10 text-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.3)]',
	'border-pink-400/60 bg-pink-500/10 text-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.3)]',
	'border-amber-400/60 bg-amber-500/10 text-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.3)]',
	'border-lime-400/60 bg-lime-500/10 text-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.3)]',
	'border-rose-400/60 bg-rose-500/10 text-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.3)]',
]

const roboChipColor = 'border-[#FFD600]/60 bg-[#FFD600]/10 text-[#FFD600] shadow-[0_0_8px_rgba(255,214,0,0.3)]'

/** Maps package name to its sidebar icon component */
const packageIcons: Record<string, ComponentType<{ size?: number; className?: string }>> = {
	'robo.js': Blocks,
	'@robojs/ai': Brain,
	'@robojs/analytics': BarChart,
	'@robojs/auth': Lock,
	'@robojs/better-stack': Activity,
	'@robojs/cron': Hourglass,
	'@robojs/dev': Bug,
	'@robojs/giveaways': Gift,
	'@robojs/i18n': Translate,
	'@robojs/moderation': Shield,
	'@robojs/patch': Bandage,
	'@robojs/roadmap': Milestone,
	'@robojs/server': Server,
	'@robojs/sync': RefreshSync,
	'@robojs/trpc': DiamondNodes,
	'@robojs/xp': Trophy,
}

const typeOptions: { value: string; label: string; color: string }[] = [
	{ value: 'feat', label: 'Features', color: 'text-emerald-400' },
	{ value: 'fix', label: 'Fixes', color: 'text-blue-400' },
	{ value: 'refactor', label: 'Refactors', color: 'text-violet-400' },
	{ value: 'chore', label: 'Chores', color: 'text-gray-400' },
	{ value: 'perf', label: 'Perf', color: 'text-amber-400' },
	{ value: 'breaking', label: 'Breaking', color: 'text-red-400' },
]

const impactOptions: { value: string; label: string; color: string }[] = [
	{ value: 'major', label: 'Major', color: 'text-[#FFD600]' },
	{ value: 'minor', label: 'Minor', color: 'text-teal-400' },
	{ value: 'patch', label: 'Patch', color: 'text-gray-400' },
]

interface ChangelogFilterBarProps {
	packages: { name: string; slug: string; displayName: string }[]
	search: string
	onSearchChange: (value: string) => void
	selectedPackages: Set<string>
	onTogglePackage: (name: string) => void
	selectedTypes: Set<string>
	onToggleType: (type: string) => void
	selectedImpacts: Set<string>
	onToggleImpact: (impact: string) => void
}

export function ChangelogFilterBar({
	packages,
	search,
	onSearchChange,
	selectedPackages,
	onTogglePackage,
	selectedTypes,
	onToggleType,
	selectedImpacts,
	onToggleImpact,
}: ChangelogFilterBarProps) {
	const [filterOpen, setFilterOpen] = useState(false)
	const dropdownRef = useRef<HTMLDivElement>(null)

	const activeFilterCount = selectedTypes.size + selectedImpacts.size

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setFilterOpen(false)
			}
		}

		if (filterOpen) {
			document.addEventListener('mousedown', handleClickOutside)
			return () => document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [filterOpen])

	return (
		<div className="space-y-5">
			{/* Search bar with inline filter button */}
			<div className="changelog-search relative max-w-2xl mx-auto group/search transition-transform duration-300 ease-out hover:scale-[1.02] focus-within:!scale-100" ref={dropdownRef}>
				<div className="absolute -inset-px rounded-xl bg-gradient-to-r from-border/60 via-border/40 to-border/60" />
				<div className="absolute -inset-px rounded-xl bg-gradient-to-r from-white/4 via-white/5 to-white/4 opacity-0 transition-opacity duration-500 group-hover/search:opacity-100 group-focus-within/search:!opacity-0" />
				<div className="absolute -inset-px rounded-xl bg-gradient-to-r from-primary/40 via-primary/50 to-primary/40 opacity-0 transition-opacity duration-500 group-focus-within/search:!opacity-100" />
				<input
					type="text"
					placeholder="Search changes..."
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					className={cn(
						'relative w-full h-12 rounded-xl pl-12 text-sm bg-fd-card text-foreground placeholder:text-muted-foreground outline-none transition-all duration-300 group-hover/search:bg-[rgba(255,255,255,0.03)] group-focus-within/search:!bg-fd-card group-hover/search:shadow-[0_0_16px_-4px_rgba(var(--color-primary),0.1)] focus:!shadow-[0_0_24px_-4px_rgba(var(--color-primary),0.2)]',
						search ? 'pr-20' : 'pr-12'
					)}
				/>
				<Search className="changelog-search-icon absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground transition-colors duration-300 group-hover/search:text-foreground/80 group-focus-within/search:!text-primary pointer-events-none z-10" />
				{search && (
					<button
						onClick={() => onSearchChange('')}
						className="absolute right-11 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all z-10 cursor-pointer"
					>
						<X className="h-4 w-4" />
					</button>
				)}

				{/* Filter icon inside the bar */}
				<button
					onClick={() => setFilterOpen((prev) => !prev)}
					className={cn(
						'absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all z-10 cursor-pointer hover:scale-110 active:scale-95',
						filterOpen || activeFilterCount > 0
							? 'text-primary'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					<SlidersHorizontal className="h-4 w-4" />
					{activeFilterCount > 0 && (
						<span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
							{activeFilterCount}
						</span>
					)}
				</button>

				{/* Dropdown */}
				{filterOpen && (
						<div className="absolute right-0 top-full mt-2 w-52 origin-top-right rounded-xl border bg-fd-popover/60 backdrop-blur-lg p-2 text-sm text-fd-popover-foreground shadow-lg z-[999] animate-fd-popover-in">
							{/* Type section */}
							<div className="px-2 pt-1 pb-1">
								<span className="text-[0.65rem] font-semibold uppercase tracking-wide text-fd-muted-foreground">Change Type</span>
							</div>
							{typeOptions.map((opt) => {
								const isActive = selectedTypes.has(opt.value)
								return (
									<button
										key={opt.value}
										onClick={() => onToggleType(opt.value)}
										className="flex items-center gap-2 w-full rounded-lg p-1.5 text-sm transition-colors hover:bg-fd-primary/20 cursor-pointer"
									>
										<span className={cn('h-4 w-4 flex items-center justify-center', isActive ? opt.color : 'text-transparent')}>
											<Check className="h-3.5 w-3.5" strokeWidth={2.5} />
										</span>
										<span className={cn(isActive ? 'text-fd-foreground' : 'text-fd-muted-foreground')}>
											{opt.label}
										</span>
									</button>
								)
							})}

							<div className="mx-2 my-1 border-t border-fd-border/40" />

							{/* Impact section */}
							<div className="px-2 pt-1 pb-1">
								<span className="text-[0.65rem] font-semibold uppercase tracking-wide text-fd-muted-foreground">Impact</span>
							</div>
							{impactOptions.map((opt) => {
								const isActive = selectedImpacts.has(opt.value)
								return (
									<button
										key={opt.value}
										onClick={() => onToggleImpact(opt.value)}
										className="flex items-center gap-2 w-full rounded-lg p-1.5 text-sm transition-colors hover:bg-fd-primary/20 cursor-pointer"
									>
										<span className={cn('h-4 w-4 flex items-center justify-center', isActive ? opt.color : 'text-transparent')}>
											<Check className="h-3.5 w-3.5" strokeWidth={2.5} />
										</span>
										<span className={cn(isActive ? 'text-fd-foreground' : 'text-fd-muted-foreground')}>
											{opt.label}
										</span>
									</button>
								)
							})}
						</div>
					)}
			</div>

			{/* Package chips */}
			<div className="flex flex-wrap justify-center gap-2">
				{packages.map((pkg, i) => {
					const isActive = selectedPackages.has(pkg.name)
					const activeColor = pkg.name === 'robo.js'
						? roboChipColor
						: packageChipPalette[i % packageChipPalette.length]
					const Icon = packageIcons[pkg.name]

					return (
						<button
							key={pkg.name}
							onClick={() => onTogglePackage(pkg.name)}
							className={cn(
								'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border cursor-pointer hover:scale-105 active:scale-95',
								isActive
									? activeColor
									: 'border-transparent bg-muted/50 hover:bg-muted/80 text-muted-foreground hover:text-foreground'
							)}
						>
							{Icon && <AnimatedIconWrapper><Icon size={12} /></AnimatedIconWrapper>}
							{pkg.name === 'robo.js' ? 'robo.js' : pkg.name}
						</button>
					)
				})}
			</div>
		</div>
	)
}
