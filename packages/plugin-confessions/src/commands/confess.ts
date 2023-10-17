// imports
import { FLASHCORE_KEY } from "../core/config.js";
import { Flashcore, type CommandConfig } from "@roboplay/robo.js";
import {
  EmbedBuilder,
  type CommandInteraction,
  type TextChannel,
} from "discord.js";
import badwordsFilter from "bad-words";

export const config: CommandConfig = {
  description: "Confess Something In A Guild!",
  options: [
    {
      description: "Your Confession  to be sent",
      name: "confession",
      required: true,
      type: "string",
    },
  ],
};

/**
 * Parses confession to be safe
 * @param text
 */
function parseConfession(text: string): string {
  // parse everyone & here
  text = text.replaceAll("@everyone", "@/everyone");
  text = text.replaceAll("@here", "@/here");

  // bad words filter
  const filter = new badwordsFilter();
  text = filter.clean(text);

  // link remove
  text = text.replace(/https?:\/\/\S+\b/gi, "_<link censored>_");

  // return
  return text;
}

export default async (interaction: CommandInteraction) => {
  /* eslint-disable  @typescript-eslint/no-non-null-assertion */
  await interaction.deferReply({
    ephemeral: true,
  });
  const confession = interaction.options.get("confession")!.value;

  // get channel 
  const dbConfigChannelID =
    Flashcore.get(`${FLASHCORE_KEY}_${interaction.guild!.id}`);
  const channel = dbConfigChannelID
    ? await interaction.guild?.channels.cache.find(
        (x) => x.id == dbConfigChannelID
      )
    : null;

  // info about current channel
  if (!channel) {
    return `No Confessions Channel is set for this Guild!\n> ### Ask Admins to configure Confessions channel using commands \` / confessions-channel \``;
  }

  // confession embed
  const confessionEmbed = new EmbedBuilder()
    .setColor("Random")
    .setTitle("Anonymous Confession!")
    .setDescription(`${parseConfession(confession!.toString())}`)
    .setFooter({
      text: `⚠ This confession is fully Anonymous and filtered!`,
    })
    .setTimestamp();

  // send confession
  await (channel as TextChannel).send({
    embeds: [confessionEmbed],
  });

  // reply
  await interaction.editReply({
    content: "Confession Sent Successfully!",
  });
};
