# Logger 🌳

The `Logger` class in Robo.js is a powerful tool for logging messages in your Discord bot development.


:::tip Overview

The Logger class provides a comprehensive logging solution for your Discord bot development with Robo.js. Customize it according to your needs and leverage its features for effective debugging and monitoring.

:::


## Importing the Logger.📪

Import the `Logger` class in your code:

```javascript
import { Logger } from "@roboplay/robo.js";
```

## Creating a Logger 🪵

Create a new Logger instance:

```javascript
const logger = new Logger();
```

You can pass configuration options during instantiation:

```javascript {2}
const logger = new Logger({
  level: "debug", // Set log level 
  prefix: "DiscordLogger",// Prefix For Logs
  maxEntries: 200, // Default: 100
});
```

## Logging Messages ✍️

The Logger provides various log methods to log messages at different levels:

```javascript
logger.debug("Debugging message");
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message");
logger.othet("3rd Party message");
logger.event("Event Patched message");
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
logger.level = "debug"; // Enable debug logs
```

## Creating Child Loggers 🐣

You can create namespaced child loggers using `logger.fork()`:

```javascript {1}
const dbLogger = logger.fork("database");
dbLogger.info("Connection Initiated!");
```

**This prefixes all logs with "database"**

## Flushing Logs 🚽

You can manually flush pending logs:

```javascript
await logger.flush();
```

This ensures all buffered log writes finish before proceeding.

## Get Recent Logs 📡

Retrieve an array of recent log entries from the logger's buffer.


```javascript
const recentLogs = logger.getRecentLogs();
```

:::info 

You can also specify the number of recent logs to retrieve by passing the `count` parameter:

```javascript
const recent20Logs = logger.getRecentLogs(20);
```
> This allows you to customize the length of the retrieved log entries, providing flexibility based on your debugging and analysis needs. 

:::
