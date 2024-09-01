# 🚪 Portal

What if we told you there was a gateway to your Robo's brain? One that lets you tinker with the bits and bobs that make your bot tick? Well, get ready to step into the _Portal_. This API lets you access your Robo's inner workings and even tweak 'em without messing around with files. Now, that's power at your fingertips!

## Switch it Up with Portal 🔄

Ever wondered what it'd be like to flick a switch and make a module disappear? With Portal, you can enable or disable modules on the fly. When disabled, your Robo will play dumb as if they never existed.

Here's the magic spell to disable a module:

```javascript showLineNumbers
import { portal } from 'robo.js'

// Poof! The 'admin' module is gone
portal.module('admin').setEnabled(false)
```

And if you're curious whether a module is enabled or not, just ask:

```javascript
// Is 'admin' playing hide and seek?
const isAdminEnabled = portal.module('admin').isEnabled
```

## What's Past the Portal? 🎁

The Portal isn't just a magic wand for modules—it's a secret map to the commands, context commands, events, and middleware too. They're all nestled up in there, ripe for the picking.

Get a peek at your bot's commands:

```javascript
// Get a list of your bot's commands
const commands = portal.commands
```

Sneak a look at your bot's events:

```javascript
// Get a list of your bot's events
const events = portal.events
```

Take a gander at your bot's context commands:

```javascript
// Get a list of your bot's context commands
const context = portal.context
```

And last but not least, check out your bot's middleware:

```javascript
// Get a list of your bot's middleware
const middleware = portal.middleware
```

:::tip Friendly reminder 🔔

Changes you make through the Portal are as fleeting as dreams. They're alive and kicking while your Robo's running, but once it restarts, poof—they're gone. Keep that in mind when you're playing around in there!

:::

## Making Changes Stick 🧠

Okay, so you want to make changes that stick around, even after a restart? We've got your back. You just need a helping hand from a database.

Check out this nifty trick to remember which modules should be enabled or disabled:

```javascript showLineNumbers title="/src/events/_start.js" {9}
export default async function() {
  const database = ... // load your database

  // Function to update the states of the modules
  async function updateModuleStates() {
    const moduleStates = await database.getModuleStates();

    for (const [moduleName, isEnabled] of Object.entries(moduleStates)) {
      portal.module(moduleName).setEnabled(isEnabled);
    }
  }

  // Initial update of module states
  await updateModuleStates();

  // Poll the database every 10 minutes for changes
  setInterval(updateModuleStates, 10 * 60 * 1000);
}
```

With this trick up your sleeve, you're all set to make your bot as dynamic as you want. Fancy making your own interface to toggle modules? With Portal, it's a cinch!

## Wrapping Up 🎀

So, that's Portal for ya. A door to the heart of your Robo. A gateway to tweakin' and tunin'. It's your ticket to a whole new level of control. So step in, explore, and make your Robo _truly_ yours.
