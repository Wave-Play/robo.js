import { Flashcore } from 'robo.js'

interface TaskStats {
	total: number
	open: number
	done: number
}

const STATS_KEY = 'stats:tasks'

export async function getTaskStats(): Promise<TaskStats> {
	return (await Flashcore.get<TaskStats>(STATS_KEY)) ?? { total: 0, open: 0, done: 0 }
}

export async function incrementStat(field: keyof TaskStats): Promise<void> {
	await Flashcore.set<TaskStats>(STATS_KEY, (old) => ({
		total: old?.total ?? 0,
		open: old?.open ?? 0,
		done: old?.done ?? 0,
		[field]: ((old as Record<string, number> | undefined)?.[field] ?? 0) + 1
	}))
}

export async function decrementStat(field: keyof TaskStats): Promise<void> {
	await Flashcore.set<TaskStats>(STATS_KEY, (old) => ({
		total: old?.total ?? 0,
		open: old?.open ?? 0,
		done: old?.done ?? 0,
		[field]: Math.max(0, ((old as Record<string, number> | undefined)?.[field] ?? 0) - 1)
	}))
}

export async function resetTaskStats(): Promise<void> {
	await Flashcore.delete(STATS_KEY)
}

export async function hasTaskStats(): Promise<boolean> {
	return Flashcore.has(STATS_KEY)
}

export { STATS_KEY }
