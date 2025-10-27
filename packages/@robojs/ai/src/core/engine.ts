/**
 * Flashcore-backed helpers for managing AI conversation modes. Modes capture predefined instructions
 * that can be reused across chat sessions, enabling quick context switches for different use cases.
 */
import { randomUUID } from 'crypto'
import { Flashcore } from 'robo.js'

/** Represents a saved AI conversation mode with display metadata and optional instructions. */
interface Mode {
	id: string
	name: string
	instructions?: string
}

/**
 * Retrieves all saved AI modes from Flashcore storage.
 *
 * @returns Promise resolving to the stored modes, or an empty array when none exist.
 */
async function getAllModes(): Promise<Mode[]> {
	// Fetch modes from persistent storage, default to empty array
	const modes = (await Flashcore.get<Mode[]>('ai/modes')) ?? []

	return modes
}

/**
 * Creates a new AI mode or updates an existing one by name. Generates a unique identifier for new
 * modes and preserves the existing identifier when updating entries.
 *
 * @param mode Mode data (without ID) to create or update.
 * @returns Promise resolving to the persisted mode including its identifier.
 */
async function upsertMode(mode: Omit<Mode, 'id'>): Promise<Mode> {
	const modes = await getAllModes()

	// Check if mode with this name already exists
	const index = modes.findIndex((m) => m.name === mode.name)
	let newMode: Mode

	if (index === -1) {
		// Create new mode with generated UUID
		newMode = {
			...mode,
			id: randomUUID()
		}

		modes.push(newMode)
	} else {
		// Update existing mode while preserving its ID
		newMode = {
			...modes[index],
			...mode
		}

		modes[index] = newMode
	}

	// Persist updated modes array to storage
	await Flashcore.set('ai/modes', modes)

	return newMode
}

/** Public API surface for AI engine utilities, currently exposing mode management helpers. */
export const AiEngine = {
	Modes: {
		getAll: getAllModes,
		upsert: upsertMode
	}
}
