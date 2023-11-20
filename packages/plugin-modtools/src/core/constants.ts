import type { AutocompleteInteraction } from 'discord.js'

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

export const ID_NAMESPACE = 'plugin-modtools__'

export const Buttons = {
	CreateChannels: {
		id: ID_NAMESPACE + 'create-channels'
	},
	RequireConfirmation: {
		id: ID_NAMESPACE + 'require-confirmation'
	},
	ResetSettings: {
		id: ID_NAMESPACE + 'reset-settings'
	},
	TestMode: {
		id: ID_NAMESPACE + 'test-mode'
	},
	Unban: {
		id: ID_NAMESPACE + 'unban'
	},
}

export const Modals = {
	ReportMessage: {
		id: ID_NAMESPACE + 'report-message'
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
	ReportReason: {
		id: ID_NAMESPACE + 'text-input-report-reason'
	}
}
