import { Flashcore } from 'robo.js';

enum AllowedActions {
	Increment = 'increment',
	Decrement = 'decrement',
	Reset = 'reset'
}

// Increment built-in database count using an updater function
// https://docs.roboplay.dev/robojs/flashcore
export default async (request: Request): Promise<{ newCount?: number; error?: string | null }> => {
	const currentCount: number = (await Flashcore.get('counter')) || 0;

	const url = new URL(request.url);
	const action = url.searchParams.get('action');

	if (!Object.values(AllowedActions).includes(action as AllowedActions)) {
		return {
			error: `Invalid action: ${action}. Allowed actions are 'increment', 'decrement', 'reset'.`,
			newCount: currentCount
		};
	}

	let newCount;
	switch (action) {
		case 'increment':
			newCount = currentCount + 1;
			break;
		case 'decrement':
			newCount = currentCount - 1;
			break;
		case 'reset':
			newCount = 0;
			break;
	}

	await Flashcore.set('counter', newCount);
	return { newCount };
};
