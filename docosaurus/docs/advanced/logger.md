# Robo.js Logger Documentation

The `Logger` class in Robo.js is a powerful tool for logging messages in your Discord bot development. Below, we've structured the documentation for seamless integration with Docusaurus, incorporating code highlights and additional tips.

## Importing the Logger

Import the `Logger` class in your code:

```javascript
import { Logger } from "@roboplay/robo.js";
```

## Creating a Logger

Create a new Logger instance:

```javascript
const logger = new Logger();
```

You can pass configuration options during instantiation:

```javascript
const logger = new Logger({
  level: "debug", // Set log level 
});
```

## Logging Messages

The Logger provides various log methods to log messages at different levels:

```javascript
logger.debug("Debugging message");
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message");
```

The log level determines which messages get logged.

## Log Levels

The available log levels are:

- `trace` - Very **detailed** debugging messages
- `debug` - **Debugging** messages 
- `info` - **Informational** messages
- `warn` - **Warning** messages
- `error` - **Error** messages

> #### The default level is `info`.

## Changing Log Level

Change the log level dynamically:

```javascript
logger.level = "debug"; // Enable debug logs
```

## Creating Child Loggers 

You can create namespaced child loggers using `logger.fork()`:

```javascript {1}
const authLogger = logger.fork("auth");
authLogger.info("User authenticated");
```

This prefixes all logs with "auth".

## Flushing Logs

You can manually flush pending logs:

```javascript
await logger.flush();
```

This ensures all buffered log writes finish before proceeding.

:::info

For better readability, include the beautified code and Markdown formatting in your actual codebase.

:::

:::tip

Consider adding syntax highlighting to your documentation for a more visually appealing experience.

:::

The Logger class provides a comprehensive logging solution for your Discord bot development with Robo.js. Customize it according to your needs and leverage its features for effective debugging and monitoring.