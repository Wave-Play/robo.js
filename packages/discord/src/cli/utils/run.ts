import { fork } from 'child_process'

const ENTRY_FILE = './node_modules/@roboplay/discord/dist/entry.js'

export function run() {
	return fork(ENTRY_FILE, {
		stdio: 'inherit'
	})
}
