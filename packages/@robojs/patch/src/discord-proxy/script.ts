import { DiscordProxy } from '.'

/**
 * Automatically patches the Discord client when imported.
 * Do not import this file unless you want to patch the Discord client.
 * 
 * Usage:
 * <script src="node_modules/@robojs/patch/.robo/public/discord-proxy-patch.umd.js"></script>
 */
DiscordProxy.patch()
