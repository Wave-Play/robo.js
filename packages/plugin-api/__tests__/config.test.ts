import { SpawnOptions, spawn } from 'child_process'
import path from 'node:path'

// This has to be modified when the Robo will agree to being put in the __tests__ folder.
const PATH_TO_ROBO = path.join(process.cwd(), 'api-project-test')

// npx create-robo api-plugin-robo-test --plugins ../
describe('Integration tests for the API plug-in:', () => {
	// returns undefined or null
	/* test("Fetch returns undefined:", async () => {
	  const x = await fetch("http://localhost:3000/api/undefined");
	  expect(x).toBe(undefined);
	});*/

	// Get User

	beforeAll(async () => {
		/*await exec('npm run build', {
			cwd: PATH_TO_ROBO
		})
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		exec('npm run start', {
			cwd: PATH_TO_ROBO
		})

		await new Promise((resolve) => setTimeout(resolve, 10000))*/
	}, 50000)

	/**
	 * Test isn't working cause deeper path aren't setup.
	 *
	 */
	const apiPath = 'http://localhost:3000/api'
	const mockData = { name: 'x', age: 56, id: 9999 }
	it('Get Request:', async () => {
		const req = await fetch(`${apiPath}/getuser/michael`)
		const status = req.status

		expect(status).toBe(200)
	})

	/**
	 * Post Request
	 */
	it('Post Request:', async () => {
		const req = await fetch(`${apiPath}/CheckPost`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(mockData)
		})

		const status = req.status

		expect(status).toBe(200)
	})

	/**
	 * Put Request
	 */
	it('Put Request:', async () => {
		const req = await fetch(`${apiPath}/CheckPut`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				'My-Insane-Header-Look-At-It-Please': 'Token'
			},
			body: JSON.stringify(mockData)
		})

		const status = req.status

		expect(status).toBe(200)
	})

	/**
	 * Patch Request
	 */

	it('Patch Request:', async () => {
		const req = await fetch(`${apiPath}/CheckPatch`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				'My-Insane-Header-Look-At-It-Please': 'Token'
			},
			body: JSON.stringify(mockData)
		})

		const status = req.status

		expect(status).toBe(200)
	})

	/**
	 * Delete Request
	 */
	it('Delete Request:', async () => {
		const req = await fetch(`${apiPath}/CheckDelete?id=9999`, {
			method: 'DELETE'
		})

		const status = req.status

		expect(status).toBe(200)
	})

	/**
	 * Options Request
	 */
	it('Options Request:', async () => {
		const req = await fetch(`${apiPath}/CheckOptions`, {
			method: 'OPTIONS'
		})

		const status = req.status

		expect(status).toBe(200)
	})

	/**
	 * Head Request
	 */
	it('Head Request:', async () => {
		const req = await fetch(`${apiPath}/CheckHead`, { method: 'HEAD' })

		expect(req.headers.get('one-header')).toBe('token')
	})

	/**
	 * Post Request With Query Parameters
	 */
	it('Post Request and Query Params:', async () => {
		const req = await fetch(`${apiPath}/checkqueryparams?name=Alex&age=21&id=5693`)

		const status = req.status

		expect(status).toBe(200)
	})

	/**
	 * admin/panel/statistics
	 */
	it('Request to Admin Panel for statitics', async () => {
		const req = await fetch(`${apiPath}/admin/panel/statistics`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ sales: true })
		})

		const status = req.status
		console.log(status)
		expect(status).toBe(200)
	})

	/**
	 * Error throwing inside API route
	 */
	/*it('Throw error inside API', async () => {
		await fetch(`${apiPath}/CheckCrash`)
	})*/
})

function exec(command: string, options?: SpawnOptions) {
	return new Promise<void>((resolve, reject) => {
		// Run command as child process
		const args = command.split(' ')
		const childProcess = spawn(args.shift(), args, {
			...(options ?? {}),
			env: { ...process.env, FORCE_COLOR: '1' },
			shell: true,
			stdio: 'inherit'
		})

		// Resolve promise when child process exits
		childProcess.on('close', (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`Child process exited with code ${code}`))
			}
		})

		// Or reject when it errors
		childProcess.on('error', (error) => {
			console.log(error)
			reject(error)
		})
	})
}
