import { Flashcore } from 'robo.js'

// Increment built-in database count using an updater function
// https://docs.roboplay.dev/robojs/flashcore
export default async () => {
	await Flashcore.set('counter', (count = 0) => count + 1)
	const count = await Flashcore.get<number>('counter')

	return { count }
}
