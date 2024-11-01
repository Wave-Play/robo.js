<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/cron

Effortlessly schedule tasks with cron expressions. This robust plugin allows you to run functions at specified times, manage job persistence, and control tasks dynamically.

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
Cron('*/10 * * * * *', () => {
	console.log('This job runs every 10 seconds!')
})
```

You can schedule jobs to run when your **Robo** starts using the `/src/events/_start.js` file.

```javascript
import { Cron } from '@robojs/cron'

export default () => {
	Cron('*/10 * * * * *', () => {
		console.log('This job runs every 10 seconds!')
	})
}
```

`Cron` returns a job object that can be controlled dynamically.

```javascript
const job = Cron('*/10 * * * * *', () => {
	console.log('This job runs every 10 seconds!')
})

// Pause a job
job.pause()

// Resume a job
job.resume()

// Stop a job
job.stop()

// Get the next run time
const nextRun = job.nextRun()
console.log('Next run in', nextRun)
```

### Job File

You can also point to a file to run as a job.

```javascript
import { Cron } from '@robojs/cron'

// File: /src/events/_start.js
export default () => {
	// Runs `/src/cron/job.js` every 5 seconds
	const job = Cron('*/5 * * * * *', '/cron/job.js')
}
```

Your job file should export a default function.

```javascript
// File: /src/cron/job.js
export default () => {
	console.log('@robojs/cron is awesome!')
}
```

### Persistence

Jobs can be persisted to ensure they continue after a restart.

```javascript
import { Cron } from '@robojs/cron'

// File: /src/commands/start-job.js
export default () => {
	// Runs `/src/cron/job.js` every 5 seconds
	const job = Cron('*/5 * * * * *', '/cron/job.js')

	// Only file-based jobs can be persisted
	const jobId = await job.save()

	// Use the job ID to remove the job later
	await Cron.remove(jobId)
}
```

This is useful for creating long-running tasks as a result of a command or event. You may pass an ID to the `save` method to prevent duplication.

```javascript
const jobId = await job.save('my-job')
```

## API Overview

Create and initialize a cron job by calling `Cron(cronExpression, jobFunction)`. The `cronExpression` parameter should be a string that defines when the job will run, such as `'*/5 * * * * *'` for every 5 seconds.

```js
const job = Cron('*/5 * * * * *', () => {
	console.log('This job runs every 5 seconds!')
})
```

The `jobFunction` parameter can be either a path to a JavaScript file that exports a function or a direct function definition.

### Job Control

- **pause()**: Temporarily halts the cron job.
- **resume()**: Resumes a paused cron job.
- **stop()**: Permanently stops the cron job from running.

### Job Management

- **save()**: Persists the job so that it continues to run even after a system restart. This method returns a Promise that resolves to the unique identifier for the job, which can be used to reference the job later for operations like removal.
- **nextRun()**: Returns the next scheduled run time of the job as a `Date` object, or `null` if there is no scheduled run.

### Removing a Job

Remove a persisted job from the system by using `Cron.remove(id)`, where `id` is the unique identifier returned by the `save()` method. This function ensures that the job is no longer scheduled to run and is removed from storage.

## Cron Expressions

Cron expressions are used to define the schedule of a job. They consist of six fields separated by spaces:

1. **Seconds**: 0-59
2. **Minutes**: 0-59
3. **Hours**: 0-23
4. **Day of Month**: 1-31
5. **Month**: 1-12
6. **Day of Week**: 0-6 (Sunday to Saturday)

Each field can be a single value, a range, a list of values, or an increment. For example:

- `*` (asterisk): All values
- `*/5`: Every 5 units
- `1,2,3`: Specific values
- `1-5`: Range of values
- `1-5/2`: Range with increment

### Examples

- `* * * * * *`: Every second
- `*/5 * * * * *`: Every 5 seconds
- `0 0 * * * *`: Every hour
- `0 0 0 * * *`: Every day at midnight
- `0 0 0 1 * *`: First day of every month at midnight
- `0 0 0 * * 0`: Every Sunday at midnight

Learn more about cron expressions from the **[Cron Expression Generator](https://crontab.guru/)**.

- [🔗 **Crontab Guru:** Tool to generate cron expressions.](https://crontab.guru/)
- [📚 **Cron Expression Wiki:** Learn more about cron expressions.](https://en.wikipedia.org/wiki/Cron#Cron_expression)
