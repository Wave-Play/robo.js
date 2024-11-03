import { Flashcore } from 'robo.js';

// Increment built-in database count using an updater function
// https://docs.roboplay.dev/robojs/flashcore
export default async (request, reply) => {
	const allowedActions = ['increment', 'decrement', 'reset'];
	const currentCount = (await Flashcore.get('counter')) || 0;

	const url = new URL(request.url);
	const action = url.searchParams.get('action');
	// return { action };
	if (!allowedActions.includes(action)) {
		return {
			error: `Invalid action: ${action}. Allowed actions are 'increment', 'decrement', 'reset'.`,
			count: currentCount
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

	try {
		await Flashcore.set('counter', newCount);
	} catch (e) {
		console.log(error);
	}

	return { newCount };
};
