import type { AutocompleteInteraction } from 'discord.js'

export interface BanData {
	reason?: string
}

export const deleteMessagesOptions = [
	{
		name: `Don't Delete Any`,
		value: 'none'
	},
	{
		name: 'Previous Hour',
		value: 'hour'
	},
	{
		name: 'Previous 6 Hours',
		value: '6hours'
	},
	{
		name: 'Previous 12 Hours',
		value: '12hours'
	},
	{
		name: 'Previous Day',
		value: 'day'
	},
	{
		name: 'Previous 3 Days',
		value: '3days'
	},
	{
		name: 'Previous Week',
		value: 'week'
	}
]

export function autocompleteDeleteMessages(interaction: AutocompleteInteraction) {
	const focusedValue = interaction.options.getFocused().trim().toLowerCase()
	const options = deleteMessagesOptions.filter((option) => option.name.toLowerCase().includes(focusedValue))

	return options
}

export const ID_NAMESPACE = 'plugin-modtools:'

export const Buttons = {
	Ban: {
		id: ID_NAMESPACE + 'button-ban'
	},
	CreateChannels: {
		id: ID_NAMESPACE + 'button-create-channels'
	},
	LockdownMode: {
		id: ID_NAMESPACE + 'button-lockdown-mode'
	},
	RequireConfirmation: {
		id: ID_NAMESPACE + 'button-require-confirmation'
	},
	ResetSettings: {
		id: ID_NAMESPACE + 'button-reset-settings'
	},
	TestMode: {
		id: ID_NAMESPACE + 'button-test-mode'
	},
	Unban: {
		id: ID_NAMESPACE + 'button-unban'
	}
}

export const Modals = {
	Confirm: {
		id: ID_NAMESPACE + 'modal-confirm'
	},
	ReportMessage: {
		id: ID_NAMESPACE + 'modal-report-message'
	}
}

export const Selects = {
	ChannelAudit: {
		id: ID_NAMESPACE + 'select-channel-audit'
	},
	ChannelLogs: {
		id: ID_NAMESPACE + 'select-channel-logs'
	},
	ChannelMail: {
		id: ID_NAMESPACE + 'select-channel-mail'
	},
	ModChannelRoles: {
		id: ID_NAMESPACE + 'select-mod-channel-roles'
	}
}

export const TextInputs = {
	Confirm: {
		id: ID_NAMESPACE + 'text-input-confirm'
	},
	ReportReason: {
		id: ID_NAMESPACE + 'text-input-report-reason'
	}
}
