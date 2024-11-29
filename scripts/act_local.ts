import { spawn } from 'node:child_process'
import path from 'node:path'

start(testUpgradeDependencies())

async function start(args: string[]) {
	const command = `act`
	const childProcess = spawn(command, args, { cwd: path.join(process.cwd(), '..') })

	childProcess.stdout.on('data', (data) => {
		console.log(`stdout: ${data}`)
	})

	// Stream the stderr
	childProcess.stderr.on('data', (data) => {
		console.error(`stderr: ${data}`)
	})

	// Handle the process exit
	childProcess.on('close', (code) => {
		console.log(`Child process exited with code ${code}`)
	})
}
function testUpgradeDependencies() {
	return [
		'-e',
		'./scripts/zip_templates/push_event.json',
		'-W',
		'.github/workflows/upgrade-dependencies.yml',
		'--env-file',
		'./scripts/.env',
		'--secret-file',
		'./scripts/act.vault',
		'--container-architecture',
		'linux/amd64'
	]
}
