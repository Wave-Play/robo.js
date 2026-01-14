import type { DiscordConfig } from "@robojs/discordjs";

export default {
    clientOptions: {
        intents: ["Guilds", "GuildMessages"]
    }
} satisfies DiscordConfig;