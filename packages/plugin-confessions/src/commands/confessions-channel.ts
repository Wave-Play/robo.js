// imports
import { FLASHCORE_KEY } from "../core/config.js";
import { Flashcore, type CommandConfig } from "@roboplay/robo.js";
import type { Channel, CommandInteraction } from "discord.js";
import { setState, getState } from "@roboplay/robo.js";

export const config: CommandConfig = {
  description: "Set confessions channel",
  options: [
    {
      description: "Channel to be set confessions channel",
      name: "channel",
      required: false,
      type: "channel",
    },
  ],
};

export default async (interaction: CommandInteraction) => {
  /* eslint-disable  @typescript-eslint/no-non-null-assertion */
  const channel = interaction.options.get("channel")?.channel as Channel;

  // info about current channel
  if (!channel) {
    const currentConfessionsChannel = await Flashcore.get(
      `${FLASHCORE_KEY}_${interaction.guild!.id}`
    );
    return currentConfessionsChannel
      ? `Current Confessions Channel is Configured To :- **<#${currentConfessionsChannel}>**`
      : `No Confessions Channel is set for this Guild!\n> ### Ask Admins to configure Confessions channel using commands \` / confessions-channel \``;
  }

  // channel mentioned is wrong
  if (!(channel.type == 0))
    return "Mentioned Channel Should Be A Text Channel!";

  // save channel as confessions channel
  setState(`${FLASHCORE_KEY}_${channel.guild.id}`, channel.id, {
    persist: true,
  });

  // return status
  return (
    "Confessions Channel Set Successfully!" +
    getState(`${FLASHCORE_KEY}_${channel.guild.id}`)
  );
};
