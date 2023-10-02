# Hosting 🏠

Robo.js is built to work seamlessly with RoboPlay, a WavePlay service. But hey, we won't judge if you prefer to host it on another Node-supporting platform! This guide will show you the ropes of hosting your Robo.js, ensuring your creation stays up and running 24/7, even when your computer takes a nap.

> Heads up: RoboPlay is currently invite-only, but keep an eye out for when it opens up to the public!

## Deploying to RoboPlay 🚀

Robo.js and RoboPlay are a match made in heaven, so deploying your code is a breeze. Just run `robo deploy` (or `npm run deploy` if you bootstrapped with `create-robo`):

```bash
npm run deploy
```

This command will optimize your source code and host it for free on RoboPlay. First-time deployers will be guided through a quick setup, including choosing a slot.

#### Robo slots 🎰

Every account gets 2 free **Microbot** slots and can buy unlimited **Mecha** slots.

**Microbot:** A free, lightweight slot for your Robo. It's perfect for small bots that don't need much power.
- 100MB size limit
- Limited battery life
- Might take a nap in idle mode to save energy

**Mecha:** A powerful slot for your Robo. It's perfect for large bots that need lots of power 24/7.
- 1GB size limit
- Unlimited battery power
- Speedy CPU

Link your Robo's code to any of these slots, giving your software the hardware it deserves! Buying a **Mecha**? Choose to upgrade an existing **Microbot** (keeping your config intact) or get a new Mecha slot.

> Upgrading an existing Microbot? You'll get a new Microbot slot, so you'll always have 2 free Microbots for tinkering!

## Self-hosting 🏢

Not feeling RoboPlay? No worries! Robo.js plays nice with any Node-supporting host, like [W3Schools' Full Stack Spaces](https://www.w3schools.com/spaces).

#### Building 🛠️

Some hosts might need you to run `robo build` before or after uploading your code. This step compiles your source code into an optimized production format, especially important for TypeScript users.

```bash
npm run build
```

#### Starting 🏁

After building your Robo, fire it up with the `robo start` command. If you used our interactive CLI, `start` is already in your `package.json` scripts:

```bash
npm start
```

> Remember to set up your environment variables before starting your Robo! Check out the [Secrets](/docs/basics/secrets) page for more info. You'll need to set `NODE_ENV` to `"production"` to run your Robo in production mode.

## Extra tidbits 📌

Don't forget to invite your Robo to a Discord server! Check out the [Adding to Discord servers](#) page for all the deets.
