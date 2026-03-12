'use client'

import { motion } from 'motion/react'
import { SearchX } from 'lucide-react'

export function ChangelogEmptyState({ onClear }: { onClear: () => void }) {
	return (
		<motion.div
			className="flex flex-col items-center justify-center py-20 text-center"
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.3 }}
		>
			<motion.div
				initial={{ rotate: -10, opacity: 0 }}
				animate={{ rotate: 0, opacity: 1 }}
				transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
			>
				<SearchX className="mb-4 size-10 text-muted-foreground" />
			</motion.div>
			<p className="text-lg text-muted-foreground mb-2">No changes found</p>
			<p className="text-sm text-muted-foreground/60 mb-6">
				Try adjusting your filters or search query.
			</p>
			<button
				onClick={onClear}
				className="text-primary hover:underline text-sm"
			>
				Clear all filters
			</button>
		</motion.div>
	)
}
