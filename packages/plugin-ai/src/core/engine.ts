import { randomUUID } from 'crypto'
import { Flashcore } from 'robo.js'

interface Mode {
	id: string
	name: string
	systemMessage?: string
}

async function getAllModes(): Promise<Mode[]> {
	const modes = (await Flashcore.get<Mode[]>('ai/modes')) ?? []

	return modes
}

async function upsertMode(mode: Omit<Mode, 'id'>): Promise<Mode> {
	const modes = await getAllModes()
	const index = modes.findIndex((m) => m.name === mode.name)
	let newMode: Mode

	if (index === -1) {
		newMode = {
			...mode,
			id: randomUUID()
		}
		modes.push(newMode)
	} else {
		newMode = {
			...modes[index],
			...mode
		}
		modes[index] = newMode
	}

	await Flashcore.set('ai/modes', modes)
	return newMode
}

export const AiEngine = {
	Modes: {
		getAll: getAllModes,
		upsert: upsertMode
	}
}
