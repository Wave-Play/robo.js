import { changelog } from '@/data/changelog'
import { cn } from '@/lib/utils'
import { ChangelogContent } from './changelog-content'

const allChangesCount = changelog.releases.reduce(
	(sum, r) => sum + r.packages.reduce((s, p) => s + p.changes.length, 0),
	0
)

export default function ChangelogPage() {
	return (
		<main
			className={cn(
				'w-full [grid-row:3] [grid-column:2/-1] px-6 py-12 md:px-10 md:py-16 xl:px-14',
				'transition-[padding] duration-300 ease-in-out',
				'sidebar-aware-padding'
			)}
		>
			{/* Header — static, renders before JS loads */}
			<div className="relative flex flex-col items-center text-center mb-6 py-8">
				{/* Decorative background: dot matrix + radial glow */}
				<div className="changelog-hero-bg" aria-hidden="true">
					<div className="changelog-hero-glow" />
					<div className="changelog-hero-dots" />
				</div>

				<h1 className="relative text-4xl font-bold tracking-tight md:text-5xl mb-4">Changelog</h1>
				<p className="relative text-muted-foreground text-lg max-w-2xl">
					Track every release across the ecosystem.
				</p>
			</div>

			<ChangelogContent changelog={changelog} allChangesCount={allChangesCount} />
		</main>
	)
}
