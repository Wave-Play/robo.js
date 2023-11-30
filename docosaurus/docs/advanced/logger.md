# Logger 🌳

The `Logger` class in Robo.js is a powerful tool for logging messages in your Discord bot development.

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
});
```

## Logging Messages ✍️

The Logger provides various log methods to log messages at different levels:

```javascript
logger.debug("Debugging message");
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message");
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

This prefixes all logs with "auth".

## Flushing Logs 🚽

You can manually flush pending logs:

```javascript
await logger.flush();
```

This ensures all buffered log writes finish before proceeding.

:::tip

The Logger class provides a comprehensive logging solution for your Discord bot development with Robo.js. Customize it according to your needs and leverage its features for effective debugging and monitoring.

:::