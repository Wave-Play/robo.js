import { FlashcoreSystem, f, compoundUnique } from 'robo.js/flashcore'
import type { FlashcoreModel } from 'robo.js/flashcore'
import { incrementStat, decrementStat } from './kv.js'

export interface TaskMetadata {
	notes?: string
	tags?: string[]
	dueDate?: string
}

export interface ProjectRecord {
	id: string
	name: string
	description?: string
	isActive?: boolean
	createdAt?: Date
}

export interface TaskRecord {
	id: string
	title: string
	description?: string
	status?: 'open' | 'in_progress' | 'done'
	priority?: 'low' | 'medium' | 'high'
	assigneeId?: string
	projectId: string
	estimatedHours?: number
	archived?: boolean
	metadata?: TaskMetadata
	createdAt?: Date
}

export interface LabelRecord {
	id: string
	name: string
	color: string
}

export interface ProjectSettingsRecord {
	id: string
	projectId: string
	defaultPriority?: 'low' | 'medium' | 'high'
	autoArchiveDays?: number
	notifyChannelId?: string
}

export let Project: FlashcoreModel<ProjectRecord>
export let Task: FlashcoreModel<TaskRecord>
export let Label: FlashcoreModel<LabelRecord>
export let ProjectSettings: FlashcoreModel<ProjectSettingsRecord>

export function registerModels() {
	Project = FlashcoreSystem.registerModel<ProjectRecord>('Project', {
		id: f.id(),
		name: f.string().unique(),
		description: f.string().optional(),
		isActive: f.boolean().default(true),
		createdAt: f.date().default(() => new Date()),
		tasks: f.hasMany('Task', { foreignKey: 'projectId' }).onDelete('cascade'),
		settings: f.hasOne('ProjectSettings', { foreignKey: 'projectId' })
	})

	Task = FlashcoreSystem.registerModel<TaskRecord>('Task', {
		id: f.id(),
		title: f.string(),
		description: f.string().optional(),
		status: f.enum(['open', 'in_progress', 'done']).default('open').indexed(),
		priority: f.enum(['low', 'medium', 'high']).default('medium'),
		assigneeId: f.string().optional().indexed(),
		projectId: f.string().indexed(),
		estimatedHours: f.number().optional(),
		archived: f.boolean().default(false),
		metadata: f.json<TaskMetadata>().optional(),
		createdAt: f.date().default(() => new Date()),
		project: f.relation('Project', 'projectId'),
		labels: f.manyToMany('Label'),
		_unique: compoundUnique(['title', 'projectId']),
		_version: f.number().default(0).version()
	}, {
		hooks: {
			beforeCreate: (data) => {
				const d = data as Record<string, unknown>
				if (typeof d.title === 'string') {
					d.title = d.title.trim()
				}
				return d
			},
			afterCreate: async () => {
				await incrementStat('total')
				await incrementStat('open')
			},
			beforeUpdate: (data, existing) => {
				const d = data as Record<string, unknown>
				const ex = existing as TaskRecord
				if (ex.archived && d.status !== undefined && d.archived !== false) {
					throw new Error('Cannot modify archived tasks. Unarchive first.')
				}
				return d
			},
			afterUpdate: async (record) => {
				// If status changed to done, update counters
				// Note: simplified — in production you'd compare old vs new
			},
			beforeDelete: async () => {
				// Hook fires before deletion — could log if needed
			},
			afterDelete: async () => {
				await decrementStat('total')
			}
		}
	})

	Label = FlashcoreSystem.registerModel<LabelRecord>('Label', {
		id: f.id(),
		name: f.string().unique(),
		color: f.string().default('#808080'),
		tasks: f.manyToMany('Task')
	})

	ProjectSettings = FlashcoreSystem.registerModel<ProjectSettingsRecord>('ProjectSettings', {
		id: f.id(),
		projectId: f.string().unique(),
		defaultPriority: f.enum(['low', 'medium', 'high']).default('medium'),
		autoArchiveDays: f.number().optional(),
		notifyChannelId: f.string().optional()
	})
}
