type Task<T extends unknown[]> = (...args: T) => Promise<unknown>
type EnqueuedTask<T extends unknown[]> = {
	task: Task<T>
	args: T
	resolve: (value?: unknown | PromiseLike<unknown>) => unknown
}

export default function pLimit<T extends unknown[]>(
	concurrency: number
): (fn: Task<T>, ...args: T) => Promise<unknown> {
	if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency > 0)) {
		throw new TypeError('Expected `concurrency` to be a number from 1 and up')
	}

	const queue: EnqueuedTask<T>[] = []
	let activeCount = 0

	const next = () => {
		activeCount--

		if (queue.length > 0) {
			const { task, args, resolve } = queue.shift()
			run(task, resolve, args)
		}
	}

	const run = async (fn: Task<T>, resolve: (value?: unknown | PromiseLike<unknown>) => unknown, args: T) => {
		activeCount++

		const result = fn(...args)

		resolve(result)

		try {
			await result
		} catch {
			// Do nothing
		}

		next()
	}

	const enqueue = (fn: Task<T>, resolve: (value?: unknown | PromiseLike<unknown>) => unknown, args: T) => {
		queue.push({ task: fn, args, resolve })
		;(async () => {
			// This function needs to wait until the next microtask before comparing
			// `activeCount` to `concurrency`, because `activeCount` is updated asynchronously
			// when the run function is dequeued and called. The comparison in the if-statement
			// needs to happen asynchronously as well to get an up-to-date value for `activeCount`.
			await Promise.resolve()

			if (activeCount < concurrency && queue.length > 0) {
				const { task, args, resolve } = queue.shift()
				run(task, resolve, args)
			}
		})()
	}

	const generator = (fn: Task<T>, ...args: T) =>
		new Promise<unknown>((resolve) => {
			enqueue(fn, resolve, args)
		})

	Object.defineProperties(generator, {
		activeCount: {
			get: () => activeCount
		},
		pendingCount: {
			get: () => queue.length
		},
		clearQueue: {
			value: () => {
				queue.length = 0
			}
		}
	})

	return generator
}
