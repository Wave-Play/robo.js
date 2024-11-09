// @ts-expect-error - This is valid once command file is parsed
import { getManifest } from "robo.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Snowflake,
  CommandInteraction,
  ButtonInteraction,
} from "discord.js";
import type { CommandConfig, CommandEntry } from "../../types/commands.js";

const COMMANDS_PER_PAGE = 20;
const NAMESPACE = "__robo.js__default__helpmenu";

export const config: CommandConfig = {
  description: "Displays a list of commands.",
};

export default async (interaction: CommandInteraction) => {
  const manifest = getManifest();
  const commands = getInnermostCommands(manifest.commands);

  let page = 0;
  const totalPages = Math.ceil(commands.length / COMMANDS_PER_PAGE);

  return {
    embeds: [createEmbed(commands, page, totalPages)],
    components: [
      createPaginationButtons(page, totalPages, interaction.user.id),
    ],
  };
};

function getInnermostCommands(
  commands: Record<string, CommandEntry>,
  prefix = "",
): { key: string; command: CommandEntry }[] {
  let innermostCommands: { key: string; command: CommandEntry }[] = [];
  const keys = Object.keys(commands);

  for (const key of keys) {
    if (commands[key].subcommands) {
      const subInnermostCommands = getInnermostCommands(
        commands[key].subcommands,
        prefix ? `${prefix} ${key}` : key,
      );
      innermostCommands = innermostCommands.concat(subInnermostCommands);
    } else {
      const commandPath = prefix ? `${prefix} ${key}` : key;
      innermostCommands.push({ key: commandPath, command: commands[key] });
    }
  }

  return innermostCommands;
}

function createEmbed(
  commands: {
    key: string;
    command: CommandEntry;
  }[],
  page: number,
  totalPages: number,
) {
  const poweredBy = process.env.ROBOPLAY_HOST
    ? "Powered by [**RoboPlay** ✨](https://roboplay.dev)"
    : "Powered by [**Robo.js**](https://robojs.dev)";

  const start = page * COMMANDS_PER_PAGE;
  const end = start + COMMANDS_PER_PAGE;
  const pageCommands = commands.slice(start, end);

  const embed = new EmbedBuilder()
    .setTitle("Commands")
    .setColor(16771899)
    .addFields(
      ...pageCommands.map(({ key, command }) => ({
        name: `/${key}`,
        value: command.description || "No description provided.",
        inline: false,
      })),
      { name: "\u200b", value: poweredBy, inline: false },
    )
    .setFooter({
      text: `Page:- ${page + 1} / ${totalPages}`,
    });
  return embed;
}

function createPaginationButtons(
  page: number,
  totalPages: number,
  user: Snowflake,
) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${NAMESPACE}@previous@${page}@${user}`)
      .setEmoji("⏪")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${NAMESPACE}@next@${page}@${user}`)
      .setEmoji("⏭")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === totalPages - 1),
  );
}

export async function handleHelpMenuInteraction(
  interaction: ButtonInteraction,
) {
  if (!interaction.isButton()) return;

  // Parse the page number and direction from the custom ID
  const [prefix, action, pageNo, userId] = interaction.customId.split("@");
  let page = parseInt(pageNo, 10) ?? 1;

  //   Interaction check
  if (prefix !== NAMESPACE) return;

  // Check user
  if (userId.toString() !== interaction.user.id.toString()) {
    return await interaction.reply({
      ephemeral: true,
      content:
        "This isn't the help menu. Use `/help` to access the list of commands.",
    });
  }

  const manifest = getManifest();
  const commands = getInnermostCommands(manifest.commands);
  const totalPages = Math.ceil(commands.length / COMMANDS_PER_PAGE);

  // Adjust page based on the button pressed
  if (action === "previous" && page > 0) page--;
  else if (action === "next" && page < totalPages - 1) page++;

  await interaction.update({
    embeds: [createEmbed(commands, page, totalPages)],
    components: [
      createPaginationButtons(page, totalPages, interaction.user.id),
    ],
  });
}
