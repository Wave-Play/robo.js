import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, GuildMember, } from "discord.js"
import { Flashcore, } from "robo.js"

export const config = {
	description: `Sends the Rules message with IAccept button to the channel where used`,
    options: [
        {
			name: 'button-text',
			description: 'The reason for the kick',
			type: 'string',
            required: false
		}
    ]
}

export default async (interaction: ChatInputCommandInteraction) => {
    const guild = interaction.guild
    if (!guild) return;
    
    const member = interaction.member as GuildMember;

    if (!member.permissions.has('Administrator')) {
        return('You dont have administrator permission');
    }

    const button = interaction.options.get('button-text')?.value as string ?? `I Accept`;
    const title = await Flashcore.get<string>(`rules-title`, {namespace: interaction.guild.id});
    const rules = await Flashcore.get<string>(`rules-rules`, {namespace: interaction.guild.id});
    const imageurl = await Flashcore.get<string>(`rules-imageurl`, {namespace: interaction.guild.id}) ?? `null`;
    const rolestring = await Flashcore.get(`member-role`, {namespace: `${interaction.guild.id}`});

    if (!title || !rules) {return`set the message content first using "/mod rules-msg set-rules"`}
    if (!rolestring) {return`set the member role first using "/mod rules-msg set-member-role"`}
    
    await Flashcore.set(`rules-channel`, `${interaction.channel.id}`, {namespace: `${interaction.guild.id}`});
       
    const channelid = interaction.channelId
    const channel = guild.channels.cache.get(`${channelid}`);
    const embed = new EmbedBuilder

    if (!channel || !channel.isTextBased) return

    embed.setTitle(`${title}`)
        .setColor(`Blurple`)
        .setDescription(`${rules}`)

    if (imageurl !== `null`) {
        embed.setImage(imageurl)
    }

    const cancel = new ButtonBuilder()
        .setCustomId('rulesaccept')
        .setLabel(button)
        .setStyle(ButtonStyle.Primary)

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(cancel)

        channel.send({ embeds: [embed], components: [row], })
        return
}