import { color, getState, setState } from 'robo.js';
import { discordLogger, STATE_KEYS } from 'robo.js/dist/core/constants.js';
import { checkIntents } from 'robo.js/dist/core/intents.js';
import { ChannelType } from 'discord.js';

var ready_default = async (client) => {
  const readyAt = color.dim(`(${( new Date()).toLocaleString()})`);
  discordLogger.ready(`On standby as ${color.bold(client.user.tag)}`, readyAt);
  checkIntents(client);
  const restartData = getState(STATE_KEYS.restart);
  if (restartData) {
    const { channelId, startTime } = restartData;
    const channel = client.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return;
    }
    channel.send(`\`\`\`
Successfully restarted in ${Date.now() - startTime}ms
\`\`\``);
    setState(STATE_KEYS.restart, void 0);
  }
};

export { ready_default as default };
