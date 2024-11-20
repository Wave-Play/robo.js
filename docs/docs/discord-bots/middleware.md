# 🌙 Middleware

In the heart of your Robo, there lies a potent feature known as Middleware. These are functions that are executed before each and every command or event, granting you the ability to manipulate data, introduce conditional flows, and even halt execution of events or commands based on custom criteria.

They are like the night's watch, ever-vigilant before every event and command, including those nested inside modules and plugins!

## Crafting Middleware 🛠️

Crafting middleware for your Robo is simple and straightforward. Create files inside the `/src/middleware` directory. The filenames don't really matter but remember they run alphabetically. Number prefixes can control the order (like `01-preliminary.js`). Even if placed inside modules, middleware files still impact your entire Robo!

```javascript
src/
└── middleware/
    ├── 01-check-roles.js
    ├── 02-set-timestamp.js
    └── 03-example-logger.js
```

## The MiddlewareData Parcel 📦

Each middleware function gets a `MiddlewareData` object which contains a `payload` array and a `record` object. The `payload` carries interaction objects that are passed to the event or command, while `record` provides insights about what's being intercepted.

The `record` object has key information:

- `auto` shows if the record was automatically generated.
- `handler` is a reference to the file handling the interaction. It usually contains a `default` function and might have a `config` object.
- `key` is a unique string representing a command or event. Subcommands appear as `parent/child`.
- `module` points to the module of the record. Nested modules appear as `parent/child`.
- `path` locates the handler file.
- `plugin` contains name and path if the record is part of a plugin.
- `type` indicates if the record is a 'command', 'context', or 'event'.

## Manipulating Payloads 🔄

Middleware is empowered to mutate the interaction objects, thus impacting the way events and commands behave:

```javascript title="/src/middleware/01-example.middleware.js" showLineNumbers
export default function (data) {
	const [interaction] = data.payload
	interaction.middlewareTimestamp = Date.now()
}
```

## Gatekeeping with Middleware 🚧

Middleware can be a gatekeeper, deciding if an event or command should proceed. If a middleware function returns `{ abort: true }`, the event or command execution is halted. Here's an example:

```javascript showLineNumbers {7} title="/src/middleware/02-example.middleware.js"
import { isModuleEnabled } from './utils.js'

export default async function (data) {
	const moduleStatus = await isModuleEnabled(data.record.module)

	if (!moduleStatus) {
		return { abort: true }
	}
}
```

## Command Control with Middleware 🚦

This ability can be leveraged for user roles-based access control:

```javascript showLineNumbers {5-8} title="/src/middleware/03-admin.middleware.js"
export default function (data) {
	const [interaction] = data.payload
	const userRoles = interaction.member.roles.cache.map((role) => role.name)

	if (data.record.key.startsWith('admin/') && !userRoles.includes('Admin')) {
		interaction.reply('Sorry, this command is only for Admins!')
		return { abort: true }
	}
}
```

## Efficient Middleware ⏱️

Remember to keep your middleware lean and efficient. The execution of events and commands is on hold until middleware finishes. Keep the bot responsive!

## Error Handling ⚠️

A crucial thing to note is that any errors thrown within a middleware will halt the execution of the associated event or command. Therefore, it's essential to implement robust error handling within your middleware to prevent unwanted disruptions.

## Experimental Feature Warning 🚧

Middleware is still an experimental feature, and the API might change before we hit v1. Presently, it operates for all events, but future updates could let you specify target events. Stay tuned for updates!
