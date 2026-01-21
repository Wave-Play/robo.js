import type { Session } from '../../session.js'
import type {
	ScenarioDispatchStep,
	ScenarioAssertionResult,
	ActionMetadata,
	DispatchSlashCommandOptions,
	DispatchButtonClickOptions,
	DispatchSelectMenuOptions,
	DispatchModalSubmitOptions,
	DispatchAutocompleteOptions,
	DispatchContextMenuOptions
} from '../../../types/index.js'

/**
 * Context provided to step executors for metadata propagation and timing.
 */
export interface StepExecutionContext {
	/** Zero-based index of the current step */
	stepIndex: number
	/** Unique run identifier */
	runId: string
	/** Scenario identifier */
	scenarioId: string
	/** Timestamp when the step started (for action filtering) */
	startTimestamp: number
}

/**
 * Result returned by step executors.
 */
export interface StepExecutorResult {
	/** Whether the step executed successfully */
	success: boolean
	/** IDs of actions recorded during this step */
	recordedActionIds: string[]
	/** Error message if the step failed */
	error?: string
	/** Assertion result for assert steps */
	assertionResult?: ScenarioAssertionResult
}

/**
 * Payload types for different dispatch kinds
 */
interface SlashCommandPayload {
	command_name: string
	options?: Record<string, string | number | boolean>
}

interface ButtonClickPayload {
	custom_id: string
	message_id: string
}

interface SelectOptionPayload {
	custom_id: string
	message_id: string
	values: string[]
}

interface ModalSubmitPayload {
	custom_id: string
	fields: Record<string, string>
	message_id?: string
}

interface MessageCreatePayload {
	channel_id: string
	content?: string
	author?: { id?: string; username?: string; bot?: boolean }
	embeds?: unknown[]
	components?: unknown[]
}

interface ContextCommandPayload {
	command_name: string
	target_id: string
	context_type: 2 | 3 // 2=USER, 3=MESSAGE
}

interface AutocompletePayload {
	command_name: string
	focused_option: {
		name: string
		value: string
		type?: number
	}
	options?: Record<string, string | number | boolean>
}

/**
 * Execute a dispatch step by sending a gateway event to the bot.
 *
 * Maps the dispatch kind to the appropriate session helper and sets
 * action context for metadata propagation.
 */
export async function executeDispatchStep(
	session: Session,
	step: ScenarioDispatchStep,
	context: StepExecutionContext
): Promise<StepExecutorResult> {
	const { dispatch } = step
	const recordedActionIds: string[] = []

	// Build metadata for action context
	const metadata: ActionMetadata = {
		scenarioId: context.scenarioId,
		runId: context.runId,
		stepIndex: context.stepIndex,
		nodeId: step.expectedNodeId
	}

	// Set action context before dispatch
	session.setActionContext({ metadata })

	try {
		switch (dispatch.kind) {
			case 'slash_command': {
				const payload = dispatch.payload as SlashCommandPayload
				const options: DispatchSlashCommandOptions = {
					commandName: payload.command_name,
					options: payload.options,
					channelId: dispatch.channelId,
					guildId: dispatch.guildId,
					user: dispatch.user
				}
				await session.dispatchSlashCommand(options)
				break
			}

			case 'button_click': {
				const payload = dispatch.payload as ButtonClickPayload
				const options: DispatchButtonClickOptions = {
					customId: payload.custom_id,
					messageId: payload.message_id,
					channelId: dispatch.channelId,
					user: dispatch.user
				}
				await session.dispatchButtonClick(options)
				break
			}

			case 'select_option': {
				const payload = dispatch.payload as SelectOptionPayload
				const options: DispatchSelectMenuOptions = {
					customId: payload.custom_id,
					messageId: payload.message_id,
					values: payload.values,
					channelId: dispatch.channelId,
					user: dispatch.user
				}
				await session.dispatchSelectMenu(options)
				break
			}

			case 'modal_submit': {
				const payload = dispatch.payload as ModalSubmitPayload
				const options: DispatchModalSubmitOptions = {
					customId: payload.custom_id,
					fields: payload.fields,
					messageId: payload.message_id,
					channelId: dispatch.channelId,
					user: dispatch.user
				}
				await session.dispatchModalSubmit(options)
				break
			}

			case 'message_create': {
				const payload = dispatch.payload as MessageCreatePayload
				await session.dispatchMessage({
					channelId: dispatch.channelId ?? payload.channel_id,
					content: payload.content,
					author: payload.author,
					embeds: payload.embeds,
					components: payload.components,
					guildId: dispatch.guildId
				})
				break
			}

			case 'context_command': {
				const payload = dispatch.payload as ContextCommandPayload
				const options: DispatchContextMenuOptions = {
					commandName: payload.command_name,
					targetId: payload.target_id,
					contextMenuType: payload.context_type,
					channelId: dispatch.channelId,
					guildId: dispatch.guildId,
					user: dispatch.user
				}
				await session.dispatchContextMenu(options)
				break
			}

			case 'autocomplete': {
				const payload = dispatch.payload as AutocompletePayload
				const options: DispatchAutocompleteOptions = {
					commandName: payload.command_name,
					focusedOption: payload.focused_option,
					options: payload.options,
					channelId: dispatch.channelId,
					guildId: dispatch.guildId,
					user: dispatch.user
				}
				await session.dispatchAutocomplete(options)
				break
			}

			default:
				throw new Error(`Unknown dispatch kind: ${(dispatch as { kind: string }).kind}`)
		}

		// Collect action IDs recorded since step start
		const actions = session.recorder.getSince(context.startTimestamp)
		for (const action of actions) {
			recordedActionIds.push(action.id)
		}

		return {
			success: true,
			recordedActionIds
		}
	} catch (error) {
		return {
			success: false,
			recordedActionIds,
			error: error instanceof Error ? error.message : String(error)
		}
	}
}
