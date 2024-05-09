# 📝 Logger

Effective logging is key to understanding and debugging your Robo.js projects. While you can use JavaScript's native `console.log`, Robo.js offers a more advanced `logger` object for enhanced logging capabilities.

:::tip Overview

Logs created using logger are not only prettified but also offer additional benefits like custom log levels, custom drains, and integration with your Robo's `/dev` commands and error replies.

:::

## Using the Logger 📪

The logger is available as a global object in your Robo.js project:

```javascript
import { logger } from 'robo.js'

logger.info('Hello World!')
```

## Creating a Logger 🪵

Create a new Logger instance:

```javascript
import { Logger } from 'robo.js'

const customLogger = new Logger()
```

You can pass configuration options during instantiation:

```javascript {2-4}
const customLogger = new Logger({
	level: 'debug', // Set log level
	prefix: 'DiscordLogger', // Prefix For Logs
	maxEntries: 200 // Default: 100
})
```

:::caution Warning

We do not recommend creating your own own Logger instance. Instead, use the default `logger` instance provided by Robo.js.

:::

## Logging Messages ✍️

The Logger provides various log methods to log messages at different levels:

```javascript
logger.debug('Debugging message')
logger.info('Info message')
logger.warn('Warning message')
logger.error('Error message')
logger.other('3rd Party message')
logger.event('Event Patched message')
```

The log level determines which messages get logged.

## Log Levels 🎚️

The available log levels are:

- `trace` - Very **detailed** debugging messages
- `debug` - **Debugging** messages
- `info` - **Informational** messages
- `warn` - **Warning** messages
- `error` - **Error** messages

:::info

#### The default level is `info`.

:::

### Changing Log Level

Change the log level dynamically:

```javascript
logger.level = 'debug' // Enable debug logs
```

## Creating Child Loggers 🐣

You can create namespaced child loggers using `logger.fork()`:

```javascript {1}
const dbLogger = logger.fork('database')
dbLogger.info('Connection Initiated!')
```

**This prefixes all logs with "database"**

This is especially useful in plugins or modules where you want to identify the source of the log easily.

## Flushing Logs 🚽

You can manually flush pending logs:

```javascript
await logger.flush()
```

This ensures all buffered log writes finish before proceeding.

## Get Recent Logs 📡

Retrieve an array of recent log entries from the logger's buffer.

```javascript
const recentLogs = logger.getRecentLogs()
```

::::info How Much?

You can also specify the number of recent logs to retrieve by passing the `count` parameter:

```javascript
const recent20Logs = logger.getRecentLogs(20) // Default: 50
```

:::tip

This allows you to customize the length of the retrieved log entries, providing flexibility based on your debugging and analysis needs.

:::

::::

## Custom Drains

A unique feature of the Robo.js logger is the ability to define custom drains. A drain is essentially a target where your logs are sent. By default, logs are sent to the console, but you can configure custom drains to redirect them to external logging services or files.

:::tip Plugin Available

Our official plugin [`@roboplay/plugin-better-stack`](https://github.com/Wave-Play/robo.js/tree/main/packages/plugin-better-stack) forwards logs to [Better Stack Logs](https://betterstack.com/logs) for a more user-friendly interface and efficient log searching.

:::

### Setting a Custom Drain

You can set a new log drain using the `setDrain()` function or by specifying it in the logger configuration.

**Method 1: Using `setDrain()` Function**

```javascript
import { logger } from 'robo.js'

function customDrain(logger, level, ...data) {
	// Your custom drain logic
}

logger.setDrain(customDrain)
```

**Method 2: Specifying in the Logger Constructor**

```javascript
import { Logger } from 'robo.js'

const logger = new Logger({
	drain: customDrain
})
```

**Method 3: In the `robo.mjs` Configuration**

```javascript
// robo.mjs
export default {
	logger: {
		drain: customDrain
	}
}
```

The default drain function looks like this:

```javascript
function consoleDrain(logger, level, ...data) {
	// Default drain logic
}
```

## Optimized Logging for Robo.js

Robo.js's logger is optimized for asynchronous operation, ensuring better performance and reliability. It writes logs in parallel and maintains a flush queue to ensure all logs are written, even if the Robo crashes. This optimization is crucial for capturing every detail of your Robo's operation, especially in critical situations.

Additionally, logs from the logger are integrated into the `/dev logs` command and error replies, enabling in-Discord debugging. This feature allows for efficient troubleshooting without the need to switch between different environments.
