import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, BaseMessageOptions, ButtonBuilder, ButtonStyle, EmbedBuilder, APISelectMenuComponent } from "discord.js";
import { RoleSetupData } from "./types";

export const getRolesSetupEmbed = (data: RoleSetupData) => {
    const introEmbed = new EmbedBuilder()
        .setTitle(data.title ?? 'Role Selector!')
        .setColor((data.color) ? ((`#${data.color.replaceAll("#", '').toString()}`)) : "Blurple")
        .setDescription(data.description ?? 'Select Roles From Dropdown Below!')
        .setTimestamp();

    data.roles?.forEach((x, i) => introEmbed.addFields({ name: `Roles Added To Dropper #${i + 1}`, value: `${x.emote ?? `#${i + 1}`} - **<@!${x.label}>**` }))
    return introEmbed
}

export const getRolesSetupButtons = (ID: string, disabled: boolean = true) => {
    // Buttons 
    const addBtn = new ButtonBuilder()
        .setCustomId(`addBtn@${ID}`)
        .setLabel('Add Role')
        .setStyle(ButtonStyle.Primary);
    const deleteBtn = new ButtonBuilder()
        .setCustomId(`deleteBtn@${ID}`)
        .setLabel('Delete Role')
        .setDisabled(disabled)
        .setStyle(ButtonStyle.Danger);
    const printBtn = new ButtonBuilder()
        .setCustomId(`printSetupBtn@${ID}`)
        .setLabel('Print Setup')
        .setDisabled(disabled)
        .setStyle(ButtonStyle.Success);
    // intro row 
    const introRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(addBtn, deleteBtn, printBtn);
    return introRow
}

export const printRoleSetup = (data: RoleSetupData): BaseMessageOptions => {
    const embed = new EmbedBuilder()
        .setTitle(data.title ?? 'Role Selector!')
        .setColor((data.color) ? ((`#${data.color.replaceAll("#", '').toString()}`)) : "Blurple")
        .setDescription(data.description ?? 'Select Roles From Dropdown Below!')
        .setTimestamp();

    const rolesDropdownOptions: StringSelectMenuOptionBuilder[] = [];

    data.roles?.forEach(x => {
        rolesDropdownOptions.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(x.label)
                .setValue(`roleDropper@${x.role}`)
        )
    })

    const rolesDropdown = new StringSelectMenuBuilder()
        .setCustomId(`rolesSelector@${data.id}`)
        .setPlaceholder('Select Your Role Here!')
        .addOptions(rolesDropdownOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(rolesDropdown);

    return {
        embeds: [embed],
        components: [row]
    }
}