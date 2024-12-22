import { spawn } from 'node:child_process'
import path from 'node:path'
import { logger } from 'robo.js'

start(testUpgradeDependencies())

async function start(args: string[]) {
	const command = `act`
	const childProcess = spawn(command, args, { cwd: path.join(process.cwd(), '..') })

	childProcess.stdout.on('data', (data) => {
		logger.log(data?.toString())
	})

	// Stream the stderr
	childProcess.stderr.on('data', (data) => {
		logger.error(data?.toString())
	})

	// Handle the process exit
	childProcess.on('close', (code) => {
		logger.info(`Child process exited with code ${code}`)
	})
}
function testUpgradeDependencies() {
	return [
		'-e',
		'./scripts/src/data/push_event.json',
		'-W',
		'.github/workflows/update-dependencies.yml',
		'--env-file',
		'./scripts/.env',
		'--secret-file',
		'./scripts/act.vault',
		'--container-architecture',
		'linux/arm64'
	]
}
