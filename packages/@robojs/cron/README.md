<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/cron

Schedule tasks to run at specific times using cron expressions.

**Features:**

- Run functions on a schedule using cron expressions.
- Persist file-based jobs to keep them running after a restart.
- Pause, resume, and stop jobs as needed.
- Get the next run time for a job.

## Installation

To add this plugin to your Robo.js project:

```bash
npx robo add @robojs/cron
```

New to **[Robo.js](https://robojs.dev)**? Start your project with this plugin pre-installed:

```bash
npx create-robo <project-name> -p @robojs/cron
```

## Usage

Use the `Cron` export to run a function on a schedule.

```javascript
import { Cron } from '@robojs/cron'

// File: /src/events/_start.js
export default () => {
	// Runs a function every 10 seconds
	const otherJob = Cron('*/10 * * * * *', () => {
		console.log('@robojs/cron is awesome!')
	})

	// Pause a job
	job.pause()

	// Resume a job
	job.resume()

	// Stop a job
	job.stop()

	// Get the next run time
	const nextRun = job.nextRun()
	console.log('Next run:', nextRun)
}
```

You can also point to a file to run as a job:

```javascript
import { Cron } from '@robojs/cron'

// File: /src/events/_start.js
export default () => {
	// Runs `/src/cron/job.js` every 5 seconds
	const job = Cron('*/5 * * * * *', '/cron/job.js')
}
```

Your job file should export a default function:

```javascript
// File: /src/cron/job.js
export default function () {
	console.log('This file runs every 5 seconds!')
}
```

### Persistence

File-based jobs can be persisted to keep them running after a restart.

Persist a job by calling the `save` method:

```javascript
import { Cron } from '@robojs/cron'

// File: /src/commands/start-job.js
export default () => {
	// Runs `/src/cron/job.js` every 5 seconds
	const job = Cron('*/5 * * * * *', '/cron/job.js')

	// Only file-based jobs can be persisted
	const jobId = await job.save()

	// Use the job ID to remove the job later
	// await Cron.remove(jobId)
}
```

This is useful for creating long-running tasks as a result of a command or event. You may pass an ID to the `save` method to prevent duplication.

```javascript
const jobId = await job.save('my-job')
```

## API

### `Cron(cronExpression: string, jobFunction: string | (() => void))`

Creates a new cron job.

- `cronExpression`: A cron expression string (e.g., '_/5 _ \* \* \* \*' for every 5 seconds)
- `jobFunction`: Either a path to a JavaScript file (for file-based jobs) or a function to execute

### `job.save(): Promise<string>`

Persists a file-based job to Flashcore. Returns a Promise that resolves to the job ID.

### `Cron.remove(id: string): Promise<void>`

Removes a persisted job from Flashcore.

### `job.pause(): void`

Pauses the job.

### `job.resume(): void`

Resumes a paused job.

### `job.stop(): void`

Stops the job.

### `job.nextRun(): Date | null`

Returns the next scheduled run time for the job.
