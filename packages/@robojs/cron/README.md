<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/cron

A cron plugin for Robo.js that provides scheduling functionality using the croner package and persistence via Flashcore.

## Installation

To add this plugin to your Robo.js project:

```bash
npx robo add @robojs/cron
```

## Usage

This plugin provides a `Cron` class that you can use to create and manage cron jobs in your Robo.js project. Here's an example of how you can use it:

```javascript
import { Cron } from '@robojs/cron'

// Create a file-based cron job (can be persisted)
const job = new Cron('*/5 * * * * *', '/path/to/your/job.js')
const jobId = await job.save()

// Create a function-based cron job (cannot be persisted)
const otherJob = new Cron('*/10 * * * * *', () => {
	console.log('This is another job!')
})

// Pause a job
job.pause()

// Resume a job
job.resume()

// Stop a job
job.stop()

// Get the next run time
const nextRun = job.nextRun()

// Remove a persisted job
await Cron.remove(jobId)
```

### File-based Jobs

For file-based jobs, create a JavaScript file with a default export function:

```javascript
// /path/to/your/job.js
export default function () {
	console.log('This cron job runs every 5 seconds!')
}
```

### Persistence

File-based jobs are automatically persisted and restored when your bot restarts. The plugin uses Flashcore to store job information.

## API

### `new Cron(cronExpression: string, jobFunction: string | (() => void))`

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

## License

MIT
