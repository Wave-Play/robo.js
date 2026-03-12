import type { ChangeEntry as ChangeEntryType } from '@/data/changelog'
import { cn } from '@/lib/utils'
import { AlertTriangle, Circle, Gauge, Plus, RefreshCw, Wrench } from 'lucide-react'

const typeConfig: Record<string, { icon: typeof Plus; colorClass: string }> = {
	feat: { icon: Plus, colorClass: 'text-emerald-400' },
	fix: { icon: Wrench, colorClass: 'text-blue-400' },
	refactor: { icon: RefreshCw, colorClass: 'text-violet-400' },
	chore: { icon: Circle, colorClass: 'text-gray-400' },
	perf: { icon: Gauge, colorClass: 'text-amber-400' },
}

const breakingConfig = { icon: AlertTriangle, colorClass: 'text-red-400' }
const defaultConfig = { icon: Circle, colorClass: 'text-gray-400' }

export function ChangeEntryLine({ entry }: { entry: ChangeEntryType }) {
	const config = entry.breaking
		? breakingConfig
		: typeConfig[entry.type] ?? defaultConfig
	const Icon = config.icon

	return (
		<div className="group/entry flex items-start gap-2 py-1">
			<Icon className={cn('mt-0.5 size-3.5 shrink-0', config.colorClass)} />
			<span className="text-sm text-foreground/80">
				{entry.scope && (
					<span className="font-mono text-xs text-muted-foreground">({entry.scope}) </span>
				)}
				{entry.message}
			</span>
			<a
				href={`https://github.com/Wave-Play/robo.js/commit/${entry.hash}`}
				target="_blank"
				rel="noopener noreferrer"
				className="ml-auto shrink-0 font-mono text-xs text-muted-foreground opacity-0 transition-opacity group-hover/entry:opacity-100 hover:underline"
			>
				{entry.hash}
			</a>
		</div>
	)
}
