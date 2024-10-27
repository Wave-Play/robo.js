import { readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ButtonsDir = path.join(process.cwd(), '.robo', 'build', 'buttons')
const ModalsDir = path.join(process.cwd(), '.robo', 'build', 'modals')

export const ButtonHandlers = new Map<string, any>()
export const ModalHandlers = new Map<string, any>()

/*
 * Load interaction handlers in advance for future use
 */
export default async () => {
	await Promise.all([
		...readdirSync(ButtonsDir).map(async (fileName) => {
			const filePath = path.join(ButtonsDir, fileName)
			const fileURL = pathToFileURL(filePath).href
			const handler = await import(fileURL)
			ButtonHandlers.set(handler.customID, handler.default)
		}),
		...readdirSync(ModalsDir).map(async (fileName) => {
			const filePath = path.join(ModalsDir, fileName)
			const fileURL = pathToFileURL(filePath).href
			const handler = await import(fileURL)
			ModalHandlers.set(handler.customID, handler.default)
		})
	])
}
