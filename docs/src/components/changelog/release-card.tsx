'use client'

import type { ComponentType } from 'react'
import type { PackageRelease } from '@/data/changelog'
import { cn } from '@/lib/utils'
import { motion } from 'motion/react'
import { ExaCard } from '@/components/ui/exa-card'
import { AnimatedIconWrapper } from '@/components/ui/icons/animated-icon-wrapper'
import {
	Activity, BarChart, Blocks, Brain, Bug, Bandage, DiamondNodes, Gift, Hourglass,
	Lock, Milestone, RefreshSync, Server, Shield, TestTube, Translate, Trophy, Wrench
} from '@/components/ui/icons'
import Link from 'next/link'
import { ChangeEntryLine } from './change-entry'

const slugIcons: Record<string, ComponentType<{ size?: number }>> = {
	ai: Brain,
	analytics: BarChart,
	auth: Lock,
	'better-stack': Activity,
	cron: Hourglass,
	dev: Bug,
	framework: Blocks,
	giveaways: Gift,
	i18n: Translate,
	maintenance: Wrench,
	mock: TestTube,
	moderation: Shield,
	patch: Bandage,
	roadmap: Milestone,
	server: Server,
	sync: RefreshSync,
	trpc: DiamondNodes,
	xp: Trophy,
}

const impactColors: Record<string, string> = {
	major: 'text-[#FFD600]',
	minor: 'text-teal-400',
	patch: 'text-muted-foreground',
}

const entryVariants = {
	hidden: { opacity: 0, x: -12 },
	visible: {
		opacity: 1,
		x: 0,
		transition: { duration: 0.25 },
	},
}

export function ReleaseCard({ pkg, immediate }: { pkg: PackageRelease; immediate?: boolean }) {
	const Icon = slugIcons[pkg.slug]

	return (
		<ExaCard className="w-full release-card-shimmer" growScale={1.01} slope={12} innerBorderWidth={1}>
			<div className="p-4 sm:p-5">
				<div className="flex items-center justify-between mb-3">
					<Link href={`/docs/${pkg.slug}`} className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:underline">
						{Icon && (
							<AnimatedIconWrapper>
								<Icon size={16} />
							</AnimatedIconWrapper>
						)}
						{pkg.name === 'robo.js' ? 'robo.js' : pkg.name}
					</Link>
					<span className={cn('text-xs font-mono font-medium', impactColors[pkg.impact])}>
						v{pkg.version}
					</span>
				</div>
				<motion.div
					className="space-y-0.5"
					initial="hidden"
					{...(immediate ? { animate: 'visible' } : { whileInView: 'visible', viewport: { once: true, margin: '-20px' } })}
					transition={{ staggerChildren: 0.04 }}
				>
					{pkg.changes.map((entry, i) => (
						<motion.div key={`${entry.hash}-${i}`} variants={entryVariants}>
							<ChangeEntryLine entry={entry} />
						</motion.div>
					))}
				</motion.div>
			</div>
		</ExaCard>
	)
}
