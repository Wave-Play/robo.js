import { ChatInputCommandInteraction, GuildMember, Role } from "discord.js"
import { Flashcore, } from "robo.js"

export const config = {
	description: `set the role members will be given afte accepting the rules`,
	options: [
		{
			name: 'role',
			description: 'select the role people will get from the rules button',
			type: 'role',
			required: true
		}
	]
}

export default async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild) return;
    
    const member = interaction.member as GuildMember;

    if (!member.permissions.has('Administrator')) {
        return('You dont have administrator permission');
    }

    const role = interaction.options.get('role') as Role

    await Flashcore.set(`member-role`, `${role.name}`, {namespace: `${interaction.guild.id}`});

    return ({content: `Member role set to ${role.name}`})
}