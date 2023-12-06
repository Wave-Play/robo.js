import { Flashcore } from "@roboplay/robo.js";
import { ButtonInteraction, ModalSubmitInteraction, type Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, Snowflake } from "discord.js";
import { RoleSetupData, REGEXPS as regexps } from "../core/types.js";
import {getRolesSetupEmbed,getRolesSetupButtons, printRoleSetup} from "../core/utils.js";

/**
 * @todo
 * @param i 
 * @param id 
 * @returns {RoleSetupData} RoleSetupData
 */
const getRolesSetupInfo = (i: Interaction, id: string): any => {
    return new Promise(async (resolve, reject) => {
        const data = await Flashcore.get(`__roles_Setup@${id}`)
        if (!data) {
            reject()
        } else {
            resolve(data as RoleSetupData)
        }
    })
}

export default async (interaction: Interaction) => {
    console.log(interaction, interaction.isModalSubmit(), interaction.id)
    /**
     * @plugin Roles Btns
     * @btns Print Setup
     */
    if (interaction.isButton()) {
        console.log("HEREOEEE", interaction.customId, (regexps.addBtn.test(interaction.customId)))
        // Btn Info 
        const btn = interaction as ButtonInteraction
        const btnID = btn.customId.split("@")[1];

        // Handlers 
        if (regexps.deleteBtn.test(btn.customId)) {
            // Delete Role Button 
            const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(btn, btnID)
            const deleteModal = new ModalBuilder()
                .setCustomId(`deleteModal@${rolesSetupInfo.id}`)
                .setTitle('Delete Role From Setup!');
            const roleIDInput = new TextInputBuilder()
                .setCustomId('roleID')
                .setLabel("Enter The ID Of Role You Want To Delete!")
                .setPlaceholder("For Example: 1 or #1")
                .setMaxLength(2)
                .setMinLength(1)
                .setStyle(TextInputStyle.Short);
            deleteModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(roleIDInput));
            await btn.showModal(deleteModal)
        }
        if (true || regexps.addBtn.test(btn.customId)) {
            // Add Role Button 
            const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(btn, btnID)
            const addModal = new ModalBuilder()
                .setCustomId(`addModal@${rolesSetupInfo.id}`)
                .setTitle('Add Role In Setup!');
            const roleIDInput = new TextInputBuilder()
                .setCustomId('roleID')
                .setLabel("Enter The ID Of Role You Want To Add!")
                .setPlaceholder("For Example: 739454321661313000")
                .setMaxLength(18)
                .setMinLength(18)
                .setStyle(TextInputStyle.Short);
            const roleEmote = new TextInputBuilder()
                .setCustomId('roleEmote')
                .setLabel("Enter Single Emote for Role You Want To Add!")
                .setPlaceholder("For Example: 🤡 (optional)")
                .setRequired(false)
                .setStyle(TextInputStyle.Short);

            addModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(roleIDInput));
            addModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(roleEmote));
            await btn.showModal(addModal)
        }
        // Print 
        if(regexps.printSetupBtn.test(btn.customId)) {
            const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(btn, btnID)
            const data = printRoleSetup(rolesSetupInfo)
            await interaction.channel?.send(data).then(async () => {
                return await interaction.reply({
                    content: "Success!"
                })
            }).catch(async () => {
                return await interaction.reply({
                    ephemeral: true,
                    content: "Internal Error"
                })
            })
        }
        // Dropper Button 
        if(regexps.roleDropper.test(btn.customId)) {
            const roleID = btn.customId.split("@").join("");
            const role = await interaction.guild?.roles.fetch(roleID);
            if(!role) {
                return await interaction.reply({
                    ephemeral: true,
                    content: "Internal Error"
                })
            }
            try {
                await interaction.guild?.roles.fetch()
                const member = await interaction.guild?.members.fetch(interaction.user.id)
                member!.roles.add(role)
            } catch {
                return await interaction.reply({
                    ephemeral: true,
                    content: "Internal Error"
                })
            }
        }
    }

    /**
     * @plugin Roles Btns
     * @modals Print Setup
     */
    if (interaction.isModalSubmit()) {
        // Modal Info 
        const modal = interaction as ModalSubmitInteraction
        const modalID = modal.customId.split("@")[1];
        // Handlers 
        if (regexps.deleteModal.test(modal.customId)) {
            // delete Role 
            const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(modal, modalID)
            const deleteIndex = parseInt(modal.fields.getTextInputValue('roleID').toString().replaceAll("#", ''));
            if (isNaN(deleteIndex)) return;
            delete rolesSetupInfo.roles![deleteIndex];
            await Flashcore.set(`__roles_Setup@${modalID}`, rolesSetupInfo)
            await interaction.editReply({
                embeds: [getRolesSetupEmbed(rolesSetupInfo)],
                components: [getRolesSetupButtons(rolesSetupInfo.id)]
            })
        }
        if (true || regexps.addModal.test(modal.customId)) {
            // add Role 
            const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(modal, modalID)
            const roleID = (modal.fields.getTextInputValue('roleID').toString().replaceAll("@", '').replaceAll("<", '').replaceAll(">", ''));
            const roleEmote = modal.fields.getTextInputValue('roleEmote');

            // resolving 
            // const ROLE = await interaction.guild?.roles.fetch(roleID.toString(), {force: true});
            // const ROLE = interaction.guild?.roles.cache.get(roleID.toString());
            const test = await interaction.guild?.roles.fetch()
            const test2 = interaction.guild?.roles.cache.entries()
            const ROLE =interaction.guild?.roles.cache.find(x => x.id == roleID)
            const ROLE_EMOTE = interaction.guild?.emojis.resolveIdentifier(roleEmote);
            console.log("****", ROLE, roleID, test, test2)
            if (!ROLE) {
                return await interaction.reply({
                    content: "Invalid Role"
                })
            };
            rolesSetupInfo.roles?.push({
                label: ROLE.name,
                role: ROLE.id,
                emote: ROLE_EMOTE ?? null
            })
            await Flashcore.set(`__roles_Setup@${modalID}`, rolesSetupInfo)
            await interaction.message?.edit({
                embeds: [getRolesSetupEmbed(rolesSetupInfo)],
                components: [getRolesSetupButtons(rolesSetupInfo.id)]
            })
        }
    }

}