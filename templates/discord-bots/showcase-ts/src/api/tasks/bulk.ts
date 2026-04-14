import { define } from '@robojs/server'
import { z } from 'zod'
import { Task, Project } from '~/utils/models.js'

export const POST = define(
	{
		summary: 'Bulk create tasks',
		tags: ['tasks'],
		body: z.object({
			tasks: z.array(z.object({
				title: z.string(),
				description: z.string().optional(),
				priority: z.enum(['low', 'medium', 'high']).optional()
			})),
			projectName: z.string().optional(),
			skipDuplicates: z.boolean().optional()
		})
	},
	async (request) => {
		const body = await request.json()
		const projectName = body.projectName ?? 'General'

		const project = await Project.findFirst({ where: { name: projectName } })
		if (!project) {
			return new Response(JSON.stringify({ error: `Project "${projectName}" not found` }), { status: 404 })
		}

		const data = body.tasks.map((t: { title: string; description?: string; priority?: string }) => ({
			title: t.title,
			description: t.description,
			priority: t.priority ?? 'medium',
			projectId: project.id
		}))

		const result = await Task.createMany({ data, skipDuplicates: body.skipDuplicates ?? false })
		return { created: result.count }
	}
)
