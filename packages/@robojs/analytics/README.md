<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/analytics

Instant analytics for your **Robo**. This plugin automatically integrates your preferred analytics service into your project, such as **[Google Analytics](https://analytics.google.com)**, **[Plausible](https://plausible.io)**, and **[more](#other-services)**.

**Use cases:**

- Know how many times a **[Slash Command](https://robojs.dev/discord-bots/commands)** is used.
- Track how many times your **[Discord Activity](https://robojs.dev/discord-activities/getting-started)** is opened.
- Monitor number of users over time.
- Anything else you can think of. ✨

➞ [📚 **Documentation:** Getting started](https://docs.roboplay.dev/docs/getting-started)

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)

## Installation 💻

To add this plugin to your Robo.js project:

```bash
npx robo add @robojs/analytics
```

New to **[Robo.js](https://robojs.dev)**? Start your project with this plugin pre-installed:

```bash
npx create-robo <project-name> -p @robojs/analytics
```

## Getting Started ✨

How does **@robojs/analytics** know which service to use? Simple! Just add your analytics service key to your `.env` file.

For **[Google Analytics](https://analytics.google.com)**, it's a tracking ID:

```env
GOOGLE_ANALYTICS_MEASURE_ID="UA-123456789-1"
```

For **[Plausible](https://plausible.io)**, it's your domain:

```env
PLAUSIBLE_DOMAIN="example.com"
```

### Not sure which service to use?

We recommend **[Plausible](https://plausible.io)** for its simplicity and privacy-focused analytics. If you're looking for more tracking, **[Google Analytics](https://analytics.google.com)** may be a better fit. You can also use both or implement your own!

## Tracking

It happens automatically for **[Discord Bots](https://robojs.dev/discord-bots/getting-started)**! Here's what is tracked by default:

- **Events:** Automatically track when an event is triggered.
- **Slash Commands:** Automatically track when a slash command is used.

You can disable default tracking by updating the plugin config:

```javascript
// config/plugins/robojs/analytics.mjs
export default {
	track: {
		default: false
	}
}
```

Got other tracking needs? Use the **JavaScript API** to track custom events.

## JavaScript API

An `Analytics` object is available globally in your project.

```javascript
import { Analytics } from '@robojs/analytics'

export default () => {
	// Track a custom event
	Analytics.event({
		action: 'click', // Describes the action taken
		name: 'play', // Describes the event (e.g. 'play', 'pause')
		type: 'video' // Describes the type of event (e.g., video, admin)
	})

	// Track a page view
	Analytics.view('/special', {
		element: 'button',
		elementId: 'special-button'
	})

	return 'I just tracked something special!'
}
```

Feel free to use the `Analytics` object anywhere in your project! It's just **JavaScript**, after all!

## Other Services

Want to use a different analytics service? You can add your own service by extending the `BaseEngine` class and passing it in your config.

```javascript
// config/plugins/robojs/analytics.mjs
import { BaseEngine } from '@robojs/analytics'

class MyCustomEngine extends BaseEngine {
	// Implement your custom tracking logic here
}

export default {
	engine: new MyCustomEngine()
}
```

We also offer a `ManyEngine` class that allows you to use multiple analytics services at once.

```javascript
// config/plugins/robojs/analytics.mjs
import { GoogleAnalytics, Plausible, ManyEngine } from '@robojs/analytics'

export default {
	engine: new ManyEngine(new GoogleAnalytics(), new Plausible())
}
```

Mix and match services to your heart's content, or switch between them without needing to update code. Usage remains the same.
