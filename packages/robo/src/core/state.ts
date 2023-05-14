import { logger } from './logger.js'
import type { RoboMessage, RoboStateMessage, State } from '../types/index.js'
import type { ChildProcess } from 'child_process'

const state: State = {}

export function clearState(): void {
	Object.keys(state).forEach((key) => {
		delete state[key]
	})
}

export function getState<T = string>(key: string): T | null {
	return state[key] as T | null
}

export function getStateSave(botProcess: ChildProcess | null): Promise<State> {
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

export function loadState(savedState: State) {
	logger.debug(`Loading state...`, savedState)
	Object.keys(savedState).forEach((key) => {
		state[key] = savedState[key]
	})
}

export function saveState() {
	logger.debug(`Saving state...`, state)
	process.send({ type: 'state-save', state })
}

export function setState<T>(key: string, value: T): void {
	state[key] = value
}
