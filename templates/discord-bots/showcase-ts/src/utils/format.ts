import type { TaskRecord } from './models.js'

const STATUS_EMOJI: Record<string, string> = {
	open: '📋',
	in_progress: '🔨',
	done: '✅'
}

const PRIORITY_EMOJI: Record<string, string> = {
	low: '🟢',
	medium: '🟡',
	high: '🔴'
}

export function formatTaskLine(task: TaskRecord, index?: number): string {
	const prefix = index !== undefined ? `${index + 1}. ` : ''
	const taskStatus = task.status ?? 'open'
	const taskPriority = task.priority ?? 'medium'
	const status = STATUS_EMOJI[taskStatus] ?? '❓'
	const priority = PRIORITY_EMOJI[taskPriority] ?? ''
	return `${prefix}${status} **${task.title}** ${priority} (${taskStatus.replace('_', ' ')})`
}

export function formatTaskCount(count: number): string {
	return `${count} task${count === 1 ? '' : 's'}`
}

export function formatProjectHeader(name: string, taskCount: number): string {
	return `**${name}** — ${formatTaskCount(taskCount)}`
}

export function formatEstimatedHours(hours?: number): string {
	if (hours === undefined || hours === null) return ''
	return `⏱ ${hours}h`
}

export function formatArchived(archived?: boolean): string {
	return archived ? '📦 Archived' : ''
}

export function formatLabelList(labels: Array<{ name: string; color: string }>): string {
	if (!labels || labels.length === 0) return 'No labels'
	return labels.map((l) => `\`${l.name}\``).join(', ')
}
