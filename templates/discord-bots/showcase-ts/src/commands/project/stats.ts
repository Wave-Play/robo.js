import { createCommandConfig } from '@robojs/discordjs'
import { Project, Task } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Show task statistics across projects'
})

export default async () => {
	const projects = await Project.findMany()
	const totalTasks = await Task.count({})
	const openTasks = await Task.count({ where: { status: 'open' } })
	const inProgress = await Task.count({ where: { status: 'in_progress' } })
	const doneTasks = await Task.count({ where: { status: 'done' } })

	const lines = [
		`**Task Statistics**`,
		`Total: ${totalTasks} | Open: ${openTasks} | In Progress: ${inProgress} | Done: ${doneTasks}`,
		`Projects: ${projects.length}`
	]

	return lines.join('\n')
}
