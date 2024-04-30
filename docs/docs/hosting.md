# Hosting 🏠

Robo.js is built to work seamlessly with **[RoboPlay](https://roboplay.dev)**, a **[WavePlay](https://waveplay.com)** service. But hey, we won't judge if you prefer to host it on another Node-supporting platform! This guide will show you the ropes of hosting your Robo.js, ensuring your creation stays up and running 24/7, even when your computer takes a nap.

:::info **Listen!**

RoboPlay is currently invite-only, but keep an eye out for when it opens up to the public!

:::

## Deploying to RoboPlay 🚀

Robo.js and RoboPlay are a match made in heaven, so deploying your code is a breeze. Just run this one command:

```bash
npx robo deploy
```

This command will optimize your project and host it for free on RoboPlay. First-time deployers will be guided through a quick setup process, and you'll be up and running in no time!

Feel free to run this command anytime you want to update your Robo. RoboPlay will automatically update your Robo with the latest changes.

### Pods

RoboPlay offers **Pods**, which are like virtual private servers (VPS) for your Robo. Currently, each RoboPlay account comes with 1 free Beta Pod. Want more? We'll be offering additional Pods for a small fee in the future.

### Checking Status

To check the status of RoboPlay and your deployed Robos, run:

```bash
npx robo cloud status
```

This will let you know if your Robos are up and running, or if there are any issues. You can also check our **[status page](https://status.roboplay.dev)** for updates.

> **Note:** Pods live independently from our main RoboPlay infrastructure, so rest assured that your Robos will stay up and running even if RoboPlay itself experiences downtime.

### Managing Pods

You can manage your pods with the command:

```bash
npx robo cloud stop
```

This will stop your selected pod and bring your Robo offline. Stopping your pod will *not* delete any data, so you can start it back up whenever you're ready.

To start it back up, run:

```bash
npx robo cloud start
```

And that's it! Your Robo will be back online and ready to serve. Keep in mind that deploying again will automatically start your Robo.

### Checking Logs

To check the logs of your Robo, run:

```bash
npx robo cloud logs
```

This will show you the logs of your Robo, helping you debug any issues that may arise during runtime.

## Self-hosting 🏢

Not feeling RoboPlay? No worries! Robo.js plays nice with any Node-supporting host, like **[W3Schools Full Stack Spaces](https://www.w3schools.com/spaces)**.

#### Building 🛠️

Some hosts might need you to run `robo build` before or after uploading your code. This step compiles your source code into an optimized production format, especially important for TypeScript users.

```bash
npx robo build
```

#### Starting 🏁

After building your Robo, fire it up with the `robo start` command. If you used our interactive CLI, `start` is already in your `package.json` scripts:

```bash
npm start
```

:::tip

Remember to set up your environment variables before starting your Robo! Check out the **[Secrets](/docs/basics/secrets)** page for more info. You'll need to set `NODE_ENV` to `"production"` to run your Robo in production mode.

:::

## Extra tidbits 📌

Don't forget to invite your Robo to a Discord server! Check out the **[Adding to Discord servers](/docs/adding-to-server)** page for all the deets.
