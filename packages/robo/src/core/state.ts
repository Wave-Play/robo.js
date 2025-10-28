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

const NAMESPACE_DELIMITER = '__'

function hasNamespaceOption(
	options?: Pick<GetStateOptions | SetStateOptions, 'namespace'>
): options is { namespace: string | undefined } {
	return options !== undefined && Object.prototype.hasOwnProperty.call(options, 'namespace')
}

function composeNamespacedKey(namespace: string, key: string): string {
	if (namespace === '') {
		return `${NAMESPACE_DELIMITER}${key}`
	}

	return `${namespace}${NAMESPACE_DELIMITER}${key}`
}

/**
 * States are your Robo's personal memory bank.
 *
 * ```ts
 * import { State } from 'robo.js'
 *
 * // Set a value in the state
 * State.set('key', 'value')
 *
 * // Get a value from the state
 * const value = State.get('key')
 * ```
 *
 * States are ephemerally in-memory; data is lost when stopped but not when restarted.
 * 
 * [**Learn more:** State Management](https://robojs.dev/robojs/state)
 */
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

	/**
	 * Get a value from the forked state.
	 * If the value does not exist, null is returned.
	 *
	 * @param key The key to get the value for.
	 * @returns The value for the given key, or null if the key does not exist.
	 */
	public static get<T = string>(key: string, options?: GetStateOptions): T | null | undefined {
		return getState<T>(key, options)
	}

	/**
	 * Set a value in the forked state.
	 * When the persist option is set to true, the state will be persisted to disk.
	 *
	 * @param key The key to set the value for.
	 * @param value The value to set.
	 * @param options Options for setting the state. (Persisting to disk)
	 */
	public static set<T>(key: string, value: T, options?: SetStateOptions) {
		setState<T>(key, value, options)
	}

	/** @internal */
	public static __resetForTests() {
		State._prefixes.clear()
	}

	/**
	 * Creates a new state fork.
	 *
	 * @param prefix - Fork prefix (e.g. 'polls')
	 * @param options - Options for the fork (persisting all state by default)
	 * @returns - A new state fork you can deconstruct (e.g. `const { getState, setState } = State.fork('polls')`
	 */
	public fork(prefix: string, options?: StateOptions) {
		return new State(composeNamespacedKey(this._prefix, prefix), options ?? this._options)
	}

	/**
	 * Get a value from the forked state.
	 * If the value does not exist, null is returned.
	 *
	 * @param key The key to get the value for.
	 * @returns The value for the given key, or null if the key does not exist.
	 */
	getState<T = string>(key: string): T | null | undefined {
		return getState<T>(composeNamespacedKey(this._prefix, key))
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
		let finalKey = composeNamespacedKey(this._prefix, key)
		let finalOptions = { ...options }

		if (hasNamespaceOption(options) && options?.namespace !== undefined) {
			finalKey = composeNamespacedKey(
				this._prefix,
				composeNamespacedKey(options.namespace as string, key)
			)
			delete finalOptions.namespace
		}

		setState(finalKey, value, {
			...finalOptions,
			persist: options?.persist ?? this._options?.persist
		})
	}
}

const builtInTypes = ['String', 'Number', 'Boolean', 'Array', 'Object']

/**
 * Class instances are not serializable.
 * This function removes them from the state while preserving the rest of the state.
 */
export function removeInstances(value: unknown, warned = { value: false }, visited = new WeakSet()): unknown {
	if (typeof value === 'function') {
		return undefined
	}

	if (value !== null && typeof value === 'object') {
		// Check for circular reference
		if (visited.has(value as object)) {
			return undefined
		}
		visited.add(value as object)

		if (!builtInTypes.includes(value.constructor.name)) {
			if (!warned.value) {
				logger.warn('Removed state value as it is not serializable:', value)
				warned.value = true
			}

			return undefined
		} else if (Array.isArray(value)) {
			return value.map((item) => removeInstances(item, warned, visited)).filter((item) => item !== undefined)
		} else {
			const result: Record<string, unknown> = {}

			for (const key in value as Record<string, unknown>) {
				const processedValue = removeInstances((value as Record<string, unknown>)[key], warned, visited)
				if (processedValue !== undefined) {
					result[key] = processedValue
				}
			}

			return result
		}
	}

	return value
}

export function clearState(includeNamespaces = false): void {
	Object.keys(state).forEach((key) => {
		if (!includeNamespaces && key.includes(NAMESPACE_DELIMITER)) {
			return
		}
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
export function getState<T = string>(key: string, options?: GetStateOptions): T | null | undefined {
	if (hasNamespaceOption(options) && options?.namespace !== undefined) {
		key = composeNamespacedKey(options.namespace as string, key)
	}

	// Check if key exists in state
	if (Object.prototype.hasOwnProperty.call(state, key)) {
		const value = state[key]

		if (value === undefined) {
			if (options && 'default' in options) {
				return options.default as T
			}

			return undefined
		}

		return value as T
	}

	// Key does not exist, return default when provided or null
	if (options && 'default' in options) {
		return options.default as T
	}

	return null
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

	if (hasNamespaceOption(options) && options?.namespace !== undefined) {
		key = composeNamespacedKey(options.namespace as string, key)
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
			try {
				const persistedState =
					(await Flashcore.get<Record<string, unknown>>(FLASHCORE_KEYS.state)) ?? {}
				persistedState[key] = newValue
				await Flashcore.set(FLASHCORE_KEYS.state, persistedState)
			} catch (error) {
				logger.warn('Failed to persist state', error)
			}
		}
		void persistState()
	}

	return newValue as T
}
