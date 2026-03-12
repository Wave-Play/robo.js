'use client'

import type { Release } from '@/data/changelog'
import { motion } from 'motion/react'
import { ReleaseCard } from './release-card'

function formatDate(dateStr: string): string {
	if (dateStr === 'unknown') return 'Unknown Date'
	const date = new Date(dateStr + 'T00:00:00')
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	})
}

const ease = [0.25, 0.46, 0.45, 0.94] as const

const groupVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.08 },
	},
}

const cardVariants = {
	hidden: { opacity: 0, x: -20 },
	visible: {
		opacity: 1,
		x: 0,
		transition: { duration: 0.35, ease },
	},
}

export function ChangelogTimeline({ releases, immediate }: { releases: Release[]; immediate?: boolean }) {
	return (
		<div className="relative">
			{/* Vertical timeline wire with multiple staggered energy pulses */}
			<motion.div
				className="timeline-wire absolute left-[11.5px] sm:left-[15.5px] top-2 bottom-2 w-px bg-border origin-top"
				initial={{ scaleY: 0 }}
				animate={{ scaleY: 1 }}
				transition={{ duration: 0.8, ease }}
			>
				{[0, -3, -6, -9].map((delay) => (
					<div
						key={delay}
						className="timeline-pulse-line"
						style={{ animationDelay: `${delay}s` }}
					/>
				))}
			</motion.div>

			<div className="space-y-10">
				{releases.map((release, ri) => (
					<motion.div
						key={release.date}
						className="relative"
						initial="hidden"
						{...(immediate ? { animate: 'visible' } : { whileInView: 'visible', viewport: { once: true, margin: '-40px' } })}
						variants={groupVariants}
					>
						{/* Diamond node — entrance via motion, glow via CSS on inner element */}
						<motion.div
							className="absolute left-1.5 sm:left-2.5 top-1 size-3 z-[2]"
							initial={{ scale: 0, opacity: 0 }}
							{...(immediate
								? { animate: { scale: 1, opacity: 1 } }
								: { whileInView: { scale: 1, opacity: 1 }, viewport: { once: true, margin: '-40px' } }
							)}
							transition={{
								type: 'spring',
								stiffness: 500,
								damping: 15,
								delay: 0.1,
							}}
						>
							{ri === 0 && <div className="timeline-diamond-glow-ring" />}
							<div className={`size-full rotate-45 border-[1.5px] border-primary bg-background ${ri !== 0 ? 'timeline-diamond' : ''}`} />
							{ri === 0 && <div className="timeline-diamond-heartbeat" />}
						</motion.div>

						<div className="pl-10 sm:pl-12">
							{/* Date header */}
							<motion.h3
								className="text-base font-semibold text-foreground mb-4"
								variants={{
									hidden: { opacity: 0, y: 8 },
									visible: {
										opacity: 1,
										y: 0,
										transition: { duration: 0.3 },
									},
								}}
							>
								{formatDate(release.date)}
							</motion.h3>

							{/* Package release cards */}
							<div className="space-y-3">
								{release.packages.map((pkg) => (
									<motion.div
										key={`${pkg.name}-${pkg.version}`}
										variants={cardVariants}
									>
										<ReleaseCard pkg={pkg} immediate={immediate} />
									</motion.div>
								))}
							</div>
						</div>
					</motion.div>
				))}
			</div>
		</div>
	)
}
