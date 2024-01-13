import { loadConfig } from '../src/core/config.js'
import { Flashcore, prepareFlashcore } from '../src/core/flashcore.js'

describe('Basics Flashcore Test', () => {
	beforeAll(async () => {
		await loadConfig()
		await prepareFlashcore()
	})

	it('Insert basic value', async () => {
		const setValue = await Flashcore.set('my_key', 'lmao')

		expect(setValue).toBeTruthy()
	})

	it('Get basic value', async () => {
		const getValue = await Flashcore.get('my_key')
		expect(getValue).toBe('lmao')
	})

	it('Existence of a key', async () => {
		const getKey = await Flashcore.has('my_key')

		expect(getKey).toBeTruthy()
	})

	it('Delete a value', async () => {
		const deleteValue = await Flashcore.delete('my_key')

		expect(deleteValue).toBeTruthy()
	})

	it('Clear Flashcore', async () => {
		const deleteStore = await Flashcore.clear()

		expect(deleteStore).toBeTruthy()
	})
})

describe('Advanced Flashcore Test', () => {
	beforeAll(async () => {
		await prepareFlashcore()
	})

	describe('Flashcore with namespaces', () => {
		it('Insert basic value', async () => {
			const setValue = await Flashcore.set('my_key', 'lmao', {
				namespace: 'my_insane_name_space'
			})

			expect(setValue).toBeTruthy()
		})

		it('Get basic value', async () => {
			const getValue = await Flashcore.get('my_key', {
				namespace: 'my_insane_name_space'
			})
			expect(getValue).toBe('lmao')
		})

		it('Existence of a key', async () => {
			const getKey = await Flashcore.has('my_insane_name_space__my_key')

			expect(getKey).toBeTruthy()
		})

		it('Delete a value', async () => {
			const deleteValue = await Flashcore.delete('my_key', {
				namespace: 'my_insane_name_space'
			})

			expect(deleteValue).toBeTruthy()
		})

		it('Clear Flashcore', async () => {
			const deleteStore = await Flashcore.clear()

			expect(deleteStore).toBeTruthy()
		})
	})

	describe('Flashcore with Watcher functions', () => {
		beforeAll(async () => {
			await Flashcore.set('04022002', 53)

			Flashcore.on('04022002', (score) => {
				console.log(score)
			})
		})

		it('Changing the score after starting watching', async () => {
			for (let i = 0; i < 10; ++i) {
				await Flashcore.set('04022002', 60 + i)
			}
		})

		it('Changing the score after stopping to watch', async () => {
			Flashcore.off('04022002')

			for (let i = 0; i < 10; ++i) {
				await Flashcore.set('04022002', 60 + i)
			}
		})
	})

	describe('Flashcore with Serializable values', () => {
		it('Serialize Object Array', async () => {
			const x = await Flashcore.set('s_object_array', [
				{ name: 'Robo', score: 40 },
				{ name: 'Robo 2', score: 30 },
				{ name: 'Robo 3', score: 20 }
			])

			expect(x).toBeTruthy()
		})

		it('Serialize Object', async () => {
			const x = await Flashcore.set('s_object', { name: 'Robo 3', score: 20 })
			expect(x).toBeTruthy()
		})

		it('Serialize String', async () => {
			const x = await Flashcore.set('s_string', 'hello world')
			expect(x).toBeTruthy()
		})

		it('Serialize Number', async () => {
			const x = await Flashcore.set('s_number', 90)
			expect(x).toBeTruthy()
		})

		it('Serialize boolean', async () => {
			const x = await Flashcore.set('s_boolean', true)
			expect(x).toBeTruthy()
		})
	})
})
