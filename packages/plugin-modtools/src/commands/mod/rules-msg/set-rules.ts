import { ActionRowBuilder, ChatInputCommandInteraction, GuildMember, ModalBuilder, TextInputBuilder, TextInputStyle, } from "discord.js"
import { Flashcore, } from "robo.js"

export const config = {
	description: `Set the forum channel in which modmail will send the mails.`,
}

export default async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild) return;
    
    const member = interaction.member as GuildMember;

    if (!member.permissions.has('Administrator')) {
        return('You dont have administrator permission');
    }

    const title = await Flashcore.get(`rules-title`, {namespace: interaction.guild.id}) ?? ``;
    const rules = await Flashcore.get(`rules-rules`, {namespace: interaction.guild.id}) ?? ``;
    const imageurl = await Flashcore.get<string>(`rules-imageurl`, {namespace: interaction.guild.id}) ?? ``;

    const modal = new ModalBuilder()
        .setCustomId('rulesmsg')
        .setTitle('rules message content');

    const one = new TextInputBuilder()
        .setCustomId('title')
        .setLabel("the title of the embed")
        .setMaxLength(400)
        .setPlaceholder('the server title')
        .setValue(`${title}`)
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

    const two = new TextInputBuilder()
        .setCustomId('rules')
        .setLabel(`whats the description of the embed`)
        .setMaxLength(2000)
        .setPlaceholder('the rules')
        .setValue(`${rules}`)
        .setRequired(true)
        .setStyle(TextInputStyle.Paragraph);

    const three = new TextInputBuilder()
        .setCustomId('imageurl')
        .setLabel("the url to an image in the rules embed (not Required)")
        .setMaxLength(400)
        .setPlaceholder('the image link')
        .setValue(`${imageurl}`)
        .setRequired(false)
        .setStyle(TextInputStyle.Short);


    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(one);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(two);
    const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(three);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

    await interaction.showModal(modal);
    
    return
}