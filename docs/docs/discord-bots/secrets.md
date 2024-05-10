# 🔑 Secrets

Keeping your project's sensitive info under wraps is a top priority. That's why we use a `.env` file to store critical values like API keys and tokens. It helps prevent accidentally sharing these secrets on platforms like GitHub.

Robo.js makes it a breeze to work with environment variables. It automatically handles them on your behalf—all you need to do is add them to your `.env` file!

## Required Stuff 🌟

These environment variables are essential for your Robo.js project to work its magic. Don't worry—we'll walk you through how to get them.

### DISCORD_CLIENT_ID

To get the `DISCORD_CLIENT_ID`, also referred to as the Application ID by Discord, follow these steps:

1. Head over to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Sign in with your Discord account.
3. Click on the bot application you want to use or create a new one.
4. In the "General Information" tab, find the "Application ID" field.
5. In the `.env` file, add the following line: `DISCORD_CLIENT_ID=<your_application_id>`, replacing `<your_application_id>` with the value you just obtained.

### DISCORD_TOKEN

To get your `DISCORD_TOKEN`, follow these steps:

1. Click the "Bot" tab on the left.
2. If you haven't created a bot for your application yet, click "Add Bot" and confirm.
3. Find the "Token" section and click "Copy" to get your `DISCORD_TOKEN`.
4. In the `.env` file, add the following line: `DISCORD_TOKEN=<your_bot_token>`, replacing `<your_bot_token>` with the value you just copied.

## Optional (but Super Handy) 🔧

The environment variables below are not strictly necessary, but they're sure to make your life easier during development and testing.

### DISCORD_GUILD_ID

Setting up a `DISCORD_GUILD_ID` environment variable is a neat trick for testing. It ensures that any new commands you create only get applied to the Discord server this ID belongs to. To learn more about setting up test Discord servers, check out our [previous documentation](./overview). To get the `DISCORD_GUILD_ID`, follow these steps:

1. Open Discord and navigate to the server you want to use.
2. Right-click the server icon and click "Copy ID."

In your `.env` file, add the following line:

```bash title=".env"
DISCORD_GUILD_ID={your_guild_id}
```

Replace `{your_guild_id}` with the value you just obtained.

### DISCORD_DEBUG_CHANNEL_ID

The `DISCORD_DEBUG_CHANNEL_ID` environment variable is useful for directing errors to a specific channel during development. This helps developers focus on the task at hand and handle async errors that may occur during development and are out of their control. To get the `DISCORD_DEBUG_CHANNEL_ID`, follow these steps:

1. Enable Developer Mode in Discord by going to User Settings > Advanced > Developer Mode.
2. Navigate to the channel you want to use as your debug channel.
3. Right-click the channel and click "Copy ID."

In your `.env` file, add the following line:

```bash title=".env"
DISCORD_DEBUG_CHANNEL_ID={your_debug_channel_id}
```

Remember to replace `{your_debug_channel_id}` with the value you just obtained.

:::warning 🚨 Note

Using `DISCORD_DEBUG_CHANNEL_ID` is not strictly necessary, and we gently discourage its use. You shouldn't just shove errors away in a place where you can ignore them. Instead, check out the [Debugging Documentation](./debug) to learn how to handle errors effectively.

:::

## Enabling Developer Mode in Discord 🔧

Enabling Developer Mode in Discord allows you to access handy features, like copying IDs for servers, channels, and users. To enable Developer Mode, follow these simple steps:

1. Open Discord.
2. Click on the gear icon in the lower-left corner to open your User Settings.
3. In the left sidebar, scroll down and click on "Advanced."
4. Toggle on the "Developer Mode" switch.

That's it! You now have Developer Mode enabled, unlocking a world of possibilities for your bot development journey. 🚀

## Your Secret Keeper: .gitignore 🔐

Remember, your `.env` file is the sanctum of all your secret keys and sensitive info. And as the guardian of your Robo's secrets, its safety is paramount.

To ensure that your secrets never accidentally tumble out into the open world, we strongly advise including `.env` in your `.gitignore` file. This prevents the `.env` file from being committed to your Git repository, keeping your secrets safely tucked away from prying eyes.

Here's how you add it to your `.gitignore` file:

```py title=".gitignore" {2}
# add secrets file
.env
```

With this line, your `.env` will stay local and confidential, as it should. Think of it as your Robo's personal diary - meant for its eyes only! Always remember: A Robo's secrets are best kept... secret.

GitHub, Bitbucket, GitLab, or anywhere else your code calls home, this little trick keeps your Robo's secrets out of sight and out of mind. Remember, loose lips sink ships... and leaky code can do a lot worse!
