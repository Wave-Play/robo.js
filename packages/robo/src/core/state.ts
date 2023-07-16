import { FLASHCORE_KEYS } from './constants.js'
import { logger } from './logger.js'
import { Flashcore } from './flashcore.js'
import type { RoboMessage, RoboStateMessage } from '../types/index.js'
import type { ChildProcess } from 'child_process'

export const state: Record<string, unknown> = {}

interface SetStateOptions {
	persist?: boolean
}

interface StateOptions {
	persist?: boolean
}

export class State {
	private static readonly _prefixes = new Set<string>()

	private readonly _prefix: string
	private readonly _options?: StateOptions

	constructor(prefix: string, options?: StateOptions) {
		this._prefix = prefix
		this._options = options
		this.fork = this.fork.bind(this)
		this.getState = this.getState.bind(this)
		this.setState = this.setState.bind(this)
	}

	static fork(prefix: string, options?: StateOptions) {
		State._prefixes.add(prefix)
		return new State(prefix, options)
	}

	static listForks() {
		return new Array(...State._prefixes)
	}

	fork(prefix: string, options?: StateOptions) {
		return new State(`${this._prefix}__${prefix}`, options)
	}

	getState<T = string>(key: string): T | null {
		return getState<T>(`${this._prefix}__${key}`)
	}

	setState<T>(key: string, value: T, options?: SetStateOptions): void {
		setState(`${this._prefix}__${key}`, value, {
			...(options ?? {}),
			persist: options?.persist ?? this._options?.persist
		})
	}
}

const builtInTypes = ['String', 'Number', 'Boolean', 'Array', 'Object']

/**
 * Class instances are not serializable.
 * This function removes them from the state while preserving the rest of the state.
 */
export function removeInstances(value: unknown, warned = { value: false }): unknown {
	if (typeof value === 'function') {
		return undefined
	}

	if (value !== null && typeof value === 'object') {
		if (!builtInTypes.includes(value.constructor.name)) {
			if (!warned.value) {
				logger.warn('Removed state value as it is not serializable:', value)
				warned.value = true
			}

			return undefined
		} else if (Array.isArray(value)) {
			return value.map((item) => removeInstances(item, warned)).filter((item) => item !== undefined)
		} else {
			const result: Record<string, unknown> = {}

			for (const key in value as Record<string, unknown>) {
				const processedValue = removeInstances((value as Record<string, unknown>)[key], warned)
				if (processedValue !== undefined) {
					result[key] = processedValue
				}
			}

			return result
		}
	}

	return value
}

export function clearState(): void {
	Object.keys(state).forEach((key) => {
		delete state[key]
	})
}

export function getState<T = string>(key: string): T | null {
	return state[key] as T | null
}

export function getStateSave(botProcess: ChildProcess | null): Promise<Record<string, unknown>> {
	if (!botProcess) {
		return Promise.resolve({})
	}

	return new Promise((resolve, reject) => {
		const messageListener = (message: RoboMessage) => {
			// Check for the specific type of message we're waiting for
			if (isStateMessage(message)) {
				botProcess.off('message', messageListener)
				resolve(message.state)
			}
		}

		botProcess.on('message', messageListener)

		botProcess.once('error', (error) => {
			botProcess.off('message', messageListener)
			reject(error)
		})

		botProcess.send({ type: 'state-save' })
	})
}

function isStateMessage(message: RoboMessage): message is RoboStateMessage {
	return message.type === 'state-load' || message.type === 'state-save'
}

export function loadState(savedState: Record<string, unknown>) {
	logger.debug(`Loading state...`, savedState)
	Object.keys(savedState).forEach((key) => {
		state[key] = savedState[key]
	})
}

export function saveState() {
	logger.debug(`Saving state...`, state)
	process.send({ type: 'state-save', state })
}

export function setState<T>(key: string, value: T, options?: SetStateOptions): void {
	const { persist } = options ?? {}
	state[key] = value

	// Persist state to disk if requested
	if (persist) {
		const persistState = async () => {
			const persistedState = (await Flashcore.get<Record<string, unknown>>(FLASHCORE_KEYS.state)) ?? {}
			persistedState[key] = value
			Flashcore.set(FLASHCORE_KEYS.state, persistedState)
		}
		persistState()
	}
}
