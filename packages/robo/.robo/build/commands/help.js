import { getManifest } from '@roboplay/robo.js';

const config = {
  description: "Displays a list of commands."
};
function getInnermostCommands(commands, prefix = "") {
  let innermostCommands = [];
  const keys = Object.keys(commands);
  for (const key of keys) {
    if (commands[key].subcommands) {
      const subInnermostCommands = getInnermostCommands(commands[key].subcommands, prefix ? `${prefix} ${key}` : key);
      innermostCommands = innermostCommands.concat(subInnermostCommands);
    } else {
      const commandPath = prefix ? `${prefix} ${key}` : key;
      innermostCommands.push({ key: commandPath, command: commands[key] });
    }
  }
  return innermostCommands;
}
var help_default = () => {
  const manifest = getManifest();
  const commands = getInnermostCommands(manifest.commands);
  const poweredBy = process.env.ROBOPLAY_HOST ? "Powered by [**RoboPlay** \u2728](https://roboplay.dev)" : "Powered by [**Robo.js**](https://roboplay.dev/robo)";
  return {
    embeds: [
      {
        fields: [
          ...commands.map(({ key, command }) => ({
            name: `/${key}`,
            value: command.description || "No description provided.",
            inline: false
          })),
          {
            name: "\u200B",
            // Zero-width space
            value: poweredBy,
            inline: false
          }
        ],
        color: 16771899,
        title: "Commands"
      }
    ]
  };
};

export { config, help_default as default };
