import { Flashcore } from 'robo.js';

// Get count from built-in KV database
// https://docs.roboplay.dev/robojs/flashcore
export default async () => {
	const count = (await Flashcore.get('counter')) ?? 0;
	return { count };
};
