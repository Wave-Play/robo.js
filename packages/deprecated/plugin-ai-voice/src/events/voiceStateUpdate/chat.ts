import { textToSpeech } from '../../core/voice.js'
import { WriteStream, createReadStream, createWriteStream, mkdirSync } from 'node:fs'
import path from 'node:path'
import { EndBehaviorType, NoSubscriberBehavior, createAudioPlayer, createAudioResource } from '@discordjs/voice'
import { AI } from '@robojs/ai'
import { ChatMessage as GptChatMessage } from '@robojs/ai/.robo/build/engines/base.js'
import { options as aiOptions } from '@robojs/ai/.robo/build/events/_start.js'
import { ClientUser, Colors, User, VoiceBasedChannel, VoiceState } from 'discord.js'
import ffmpeg from 'fluent-ffmpeg'
import { Configuration, OpenAIApi } from 'openai'
import OpusScript from 'opusscript'
import { EventConfig, client, getState, logger } from 'robo.js'
import type { AudioReceiveStream, VoiceConnection } from '@discordjs/voice'

export const openai = new OpenAIApi(
	new Configuration({
		apiKey: process.env.OPENAI_API_KEY
	})
)

const CHANNELS = 2
const SAMPLE_RATE = 48_000

let ID = 0

interface VoiceJob {
	audioStream: AudioReceiveStream
	codec: OpusScript
	id: string
	filePath: string
	userId: string
	writeStream: WriteStream
}
const voiceJobs: Record<string, VoiceJob[]> = {}
const currentJobIds: Record<string, string> = {}

export const config: EventConfig = {
	description: `Replies to voice messages in a voice channel`
}

// TODO:
// - [ ] Set up queue when user continues speaking after ending (join queued messages as one for GPT)
// - [ ] Make Robo stop speaking when someone else starts speaking after 2 seconds (to prevent random noises from interrupting)
// - [ ] Dynamically adjust sensitivity based on how many times user interrupts with noise
// - [ ] Optimize direct audio streams to be more efficient (keep option to write after sending for debugging purposes)
// - [ ] Refactor debug code into plugin option (array of which to log)
export default async (oldState: VoiceState, newState: VoiceState) => {
	// Only handle voice state updates for this Robo
	const isSelf = oldState?.member?.user?.id === client.user?.id || newState?.member?.user?.id === client.user?.id
	if (!isSelf) {
		return
	}

	// Check if bot has joined a voice channel
	if (!oldState.channel && newState.channel) {
		await onJoin(newState.channel)
	}

	// Check if bot has left a voice channel
	else if (oldState.channel && !newState.channel) {
		await onLeave(oldState.channel)
	}

	// Check if bot has switched voice channels
	else if (oldState.channel?.id !== newState.channel?.id) {
		if (oldState.channel) {
			await onLeave(oldState.channel)
		}
		if (newState.channel) {
			await onJoin(newState.channel)
		}
	}
}

async function onJoin(channel: VoiceBasedChannel) {
	logger.info(`Joined voice channel ${channel.name} (${channel.id})`)

	// Get voice connection from shared state
	const connection = getState<VoiceConnection>(`shared.vc_connection_${channel.id}`)
	if (!connection) {
		logger.warn(`No voice connection found for channel ${channel.id}. Make sure to save in shared state!`)
		return
	}

	// TODO: Save this in the shared state? Create only if needed?
	const player = createAudioPlayer({
		behaviors: {
			noSubscriber: NoSubscriberBehavior.Pause
		}
	})
	player.on('error', (error) => {
		logger.error(`[ai-voice] Playback error:`, error)
	})
	connection.subscribe(player)

	// TODO: Save this in forked state. Perhaps unified with chat engine or context?
	const conversation: GptChatMessage[] = []

	// Create jobs queue for this channel
	const jobs: VoiceJob[] = []
	voiceJobs[channel.id] = jobs

	// Check when someone is speaking
	connection.receiver.speaking.on('start', (userId) => {
		const user = channel.guild.members.cache.get(userId)?.user
		if (!user) {
			logger.warn(`[ai-voice] No user found with ID ${userId} in channel ${channel.id}`)
			return
		}
		logger.debug(`${user?.username} started speaking`)

		channel.send({
			embeds: [
				{
					color: Colors.Blue,
					footer: {
						icon_url: user.avatarURL() ?? user.avatar ?? undefined,
						text: `${user.username} is speaking...`
					}
				}
			]
		})

		// Create job for this voice
		const fileName = `${user.username}_${user.discriminator}-${Date.now()}.pcm`
		const filePath = path.join('.robo', 'temp', fileName)
		mkdirSync(path.dirname(filePath), { recursive: true })

		const job: VoiceJob = {
			audioStream: connection.receiver.subscribe(user.id, {
				end: {
					behavior: EndBehaviorType.AfterSilence,
					duration: 1_000
				}
			}),
			codec: new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.AUDIO),
			filePath: filePath,
			id: (ID++).toString(),
			userId: user.id,
			writeStream: createWriteStream(filePath)
		}

		// Add job to queue
		currentJobIds[user.id] = job.id
		jobs.push(job)
		job.audioStream.on('data', (data) => {
			try {
				// Decode the Opus data to PCM (16-bit signed little-endian)
				const pcmData = job.codec.decode(data)
				job.writeStream.write(pcmData)
			} catch (error) {
				logger.error(`[ai-voice] Error decoding audio data: ${error}`)

				// Remove job from queue
				if (jobs.splice(jobs.indexOf(job), 1).length) {
					logger.info(`Recording stopped for ${user.username}`)
					job.audioStream.destroy()
					job.writeStream.end()
				}
				if (currentJobIds[user.id] === job.id) {
					delete currentJobIds[user.id]
				}
			}
		})

		logger.info(`Recording started for ${user.username}`)
	})

	// Check when someone stops speaking
	connection.receiver.speaking.on('end', (userId) => {
		const user = channel.guild.members.cache.get(userId)?.user
		if (!user) {
			logger.warn(`[ai-voice] No user found with ID ${userId} in channel ${channel.id}`)
			return
		}
		logger.info(`${user} stopped speaking`)
		channel.send({
			embeds: [
				{
					color: Colors.Red,
					footer: {
						icon_url: user.avatarURL() ?? user.avatar ?? undefined,
						text: `${user.username} stopped speaking`
					}
				}
			]
		})

		// Find job for this voice
		const job = jobs.find((j) => j.id === currentJobIds[user.id])
		logger.info(`Found job for ${user.username}: ${job?.filePath}`)
		if (!job) {
			logger.warn(`No job found for ${user.username}`)
			return
		}

		// Stop recording
		job.writeStream.end()

		// Compress PCM to M4A for faster network transfer
		ffmpeg()
			.input(job.filePath)
			.inputOptions(['-f s16le', '-ar 48000', '-ac 2'])
			.output(job.filePath.replace('.pcm', '.m4a'))
			.outputOptions(['-acodec aac', '-ar 16000', '-ac 1', '-b:a 128k'])
			.on('end', async () => {
				logger.warn(`Transcribing...`)
				channel.send({
					embeds: [
						{
							color: Colors.Aqua,
							footer: {
								icon_url: user.avatarURL() ?? user.avatar ?? undefined,
								text: 'Transcribing message...'
							}
						}
					]
				})

				// Create file object
				const file = createReadStream(job.filePath.replace('.pcm', '.m4a'))
				// @ts-expect-error - OpenAI forgot browsers aren't the only ones to run JS
				const response = await openai.createTranscription(file, 'whisper-1')
				const text = response.data.text
				if (!text?.trim()) {
					channel.send({
						embeds: [
							{
								color: Colors.DarkerGrey,
								footer: {
									icon_url: user.avatarURL() ?? user.avatar ?? undefined,
									text: '- No voice detected -'
								}
							}
						]
					})

					// Remove job from queue
					jobs.splice(jobs.indexOf(job), 1)
					return
				}
				conversation.push({
					role: 'user',
					content: text
				})
				logger.warn(`Whisper response:`, text)

				if (text?.trim()) {
					// TODO: Testing sending to a specific channel
					channel.send({
						embeds: [
							{
								color: Colors.Blurple,
								description: text,
								author: {
									name: user.username,
									icon_url: user.avatarURL() ?? user.avatar ?? undefined
								},
								footer: {
									text: 'Transcribed message'
								}
							}
						]
					})

					await AI.chat(
						[
							{
								role: 'system',
								content: (aiOptions.systemMessage ?? '') + ' Reply in 2 sentences or less.'
							},
							// Insert last 4 messages from conversation
							...conversation.slice(-4)
						],
						{
							channel: null,
							member: null,
							onReply: async (gptReply) => {
								conversation.push({
									role: 'assistant',
									content: gptReply.text ?? ''
								})

								// TODO: Testing sending to a specific channel
								if (client.user) {
									channel.send({
										embeds: [
											{
												color: Colors.Greyple,
												description: gptReply.text,
												author: {
													name: client.user.username,
													icon_url: client.user.avatarURL() ?? client.user.avatar ?? undefined
												},
												footer: {
													text: 'GPT message'
												}
											}
										]
									})
								}

								// Remove emojis so they're not read out
								const cleanReply = (gptReply.text ?? '')
									.replace(/<a?:\w+:\d+>/g, '')
									.replace(
										/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
										''
									)
								// Remove system emojis
								logger.info(`Clean reply:`, cleanReply)
								if (client.user) {
									debugMessage('generating-speech', channel, client.user)
									channel.send({
										embeds: [
											{
												color: Colors.LightGrey,
												footer: {
													icon_url: client.user.avatarURL() ?? client.user.avatar ?? undefined,
													text: 'Generating speech...'
												}
											}
										]
									})
								}

								// Generate speech
								const fileName = await textToSpeech(cleanReply, path.join('.robo', 'temp', `speech-${job.id}.mp3`))
								const resource = createAudioResource(createReadStream(fileName))
								player.play(resource)
								if (client.user) {
									debugMessage('ai-speaking', channel, client.user)
								}
							}
						}
					)
				}

				// Remove job from queue
				jobs.splice(jobs.indexOf(job), 1)
			})
			.on('error', (err) => {
				logger.error(err)

				// Remove job from queue
				jobs.splice(jobs.indexOf(job), 1)
			})
			.run()
	})
}

async function onLeave(channel: VoiceBasedChannel) {
	logger.info(`Left voice channel ${channel.name} (${channel.id})`)

	// Get voice connection from shared state
	const connection = getState<VoiceConnection>(`shared.vc_connection_${channel.id}`)
	if (!connection) {
		logger.warn(`No voice connection found for channel ${channel.id}. Make sure to save in shared state!`)
		return
	}

	// TODO: Clean up voice jobs by marking them as terminated
}

type DebugMessageType = 'ai-speaking' | 'generating-speech' | 'gpt' | 'transcription'
async function debugMessage(type: DebugMessageType, channel: VoiceBasedChannel, user: ClientUser | User) {
	let footerText, message
	switch (type) {
		case 'ai-speaking':
			footerText = 'GPT message'
			message = 'Speaking'
			break
		case 'generating-speech':
			footerText = 'Generating speech...'
			break
		default:
			throw new Error(`Unknown debug message type ${type}`)
	}

	channel.send({
		embeds: [
			{
				color: Colors.Greyple,
				description: message,
				author: {
					name: user.username,
					icon_url: user.avatarURL() ?? user.avatar ?? undefined
				},
				footer: {
					text: footerText
				}
			}
		]
	})
}
