import { FLASHCORE_KEYS } from './constants.js'
import { logger } from './logger.js'
import { Flashcore } from './flashcore.js'

export const state: Record<string, unknown> = {}

export interface GetStateOptions {
	default?: unknown
	namespace?: string
}

export interface SetStateOptions {
	namespace?: string
	persist?: boolean
}

export interface StateOptions {
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

	/**
	 * Creates a new state fork.
	 * This is useful for preventing state collisions between different parts of the Robo.
	 *
	 * @param prefix Fork prefix (e.g. 'polls')
	 * @param options Options for the fork (persisting all state by default)
	 * @returns A new state fork you can deconstruct (e.g. `const { getState, setState } = State.fork('polls')`
	 */
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

	/**
	 * Get a value from the forked state.
	 * If the value does not exist, null is returned.
	 *
	 * @param key The key to get the value for.
	 * @returns The value for the given key, or null if the key does not exist.
	 */
	getState<T = string>(key: string): T | null {
		return getState<T>(`${this._prefix}__${key}`)
	}

	/**
	 * Set a value in the forked state.
	 * When the persist option is set to true, the state will be persisted to disk.
	 *
	 * @param key The key to set the value for.
	 * @param value The value to set.
	 * @param options Options for setting the state. (Persisting to disk)
	 */
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

/**
 * Get a value from the state.
 * If the value does not exist, null is returned.
 *
 * @param key The key to get the value for.
 * @returns The value for the given key, or null if the key does not exist.
 */
export function getState<T = string>(key: string, options?: GetStateOptions): T | null {
	// If a namespace is provided, prepend it to the key
	if (options?.namespace) {
		key = `${options.namespace}__${key}`
	}

	return (state[key] ?? options?.default) as T | null
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

/**
 * Set a value in the state.
 * When the persist option is set to true, the state will be persisted to disk.
 *
 * @param key The key to set the value for.
 * @param value The value to set.
 * @param options Options for setting the state. (Persisting to disk)
 */
export function setState<T>(key: string, value: T | ((oldValue: T) => T), options?: SetStateOptions): T {
	const { persist } = options ?? {}

	// If a namespace is provided, prepend it to the key
	if (options?.namespace) {
		key = `${options.namespace}__${key}`
	}

	// If value is a function, use it to compute the new value based on the old value
	let newValue = value
	if (typeof value === 'function') {
		const oldValue = state[key] as T
		newValue = (value as (oldValue: T) => T)(oldValue as T)
	}

	// Apply the new value to the state
	state[key] = newValue

	// Persist state to disk if requested
	if (persist) {
		const persistState = async () => {
			const persistedState = (await Flashcore.get<Record<string, unknown>>(FLASHCORE_KEYS.state)) ?? {}
			persistedState[key] = newValue
			Flashcore.set(FLASHCORE_KEYS.state, persistedState)
		}
		persistState()
	}

	return newValue as T
}
