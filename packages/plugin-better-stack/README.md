# @robojs/better-stack

Welcome to _@robojs/better-stack_! This plugin seamlessly integrates with your existing **[Robo.js](https://github.com/Wave-Play/robo)** project, providing a comprehensive link to Better Stack, a renowned third-party service. With Better Stack, monitor your Robo's uptime and integrate logs in a visually appealing and searchable format.

## Prerequisites

Before integrating this plugin, ensure you've signed up for an account on [Better Stack](https://betterstack.com).

## Installation 💻

To install this plugin, navigate to your existing Robo project's directory and run the following command:

```bash
npx robo add @robojs/better-stack
```

Once installed, the plugin enhances your Robo with Better Stack's capabilities.

## Heartbeat Monitoring Setup

To initiate heartbeat monitoring:

1. Log into your Better Stack account.
2. Create a new heartbeat, preferably naming it after your Robo.
3. Copy the generated URL.
4. Paste the URL into the plugin's config file: `/config/plugins/roboplay/plugin-better-stack.mjs`

```js
export default {
	heartbeat: {
		url: 'https://uptime.betterstack.com/api/v1/heartbeat/8XMvMa5y7xtONEtUfj2yb8f'
	}
}
```

### Optional Configurations:

- `interval`: Set the frequency of requests to the heartbeat URL in milliseconds. Defaults to 5000ms (5 seconds).
- `debug`: Control debug logging for the heartbeat. While it's set to false by default to prevent spam, turning it on ensures correct heartbeat setup.

## Log Integration

Firstly, set up your source in Better Stack to receive a unique `sourceToken`.

**Method 1: Using Config File**

In the plugin config file, pass your `sourceToken`:

```js
export default {
	sourceToken: 'YOUR_UNIQUE_SOURCE_TOKEN'
}
```

**Method 2: Using Environment Variable**

Use an environment variable in your `.env` file:

```
BETTER_STACK_SOURCE_TOKEN="YOUR_UNIQUE_SOURCE_TOKEN"
```

**Method 3: Direct Drain Creation**

Create a drain directly within the primary config file, `robo.mjs`. This method captures logs early, ensuring comprehensive log coverage.

```js
// @ts-check
import { createLogtailDrain } from '@robojs/better-stack'

/**
 * @type {import('robo.js').Config}
 **/
export default {
	// ... other configurations
	logger: {
		drain: createLogtailDrain(process.env.LOGTAIL_TOKEN)
	}
}
```

> **Yet to embark on a Robo.js journey?** [Kickstart your Robo project!](https://docs.roboplay.dev/docs/getting-started)

Harness the synergy of Robo.js and Better Stack for an enhanced bot experience! 🚀
