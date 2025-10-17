import { logger } from 'robo.js'
import sdk, { SpeechSynthesizer } from 'microsoft-cognitiveservices-speech-sdk'

// TODO:
// - [ ] If possible, avoid random sounds counting as speech (analyze audio manually)
// - [ ] Refactor this code to be prettier
export function textToSpeech(text: string, filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const audioConfig = sdk.AudioConfig.fromAudioFileOutput(filePath)
		const speechConfig = sdk.SpeechConfig.fromSubscription(
			process.env.AZURE_SUBSCRIPTION_KEY ?? '',
			process.env.AZURE_SUBSCRIPTION_REGION ?? ''
		)
		speechConfig.speechSynthesisVoiceName = 'en-US-AmberNeural'
		speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3
		const synthesizer: SpeechSynthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig)

		synthesizer.speakTextAsync(
			text,
			(result) => {
				if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
					resolve(filePath)
				} else {
					logger.error('Speech synthesis canceled, ' + result.errorDetails + '\nDid you update the subscription info?')
					reject(result.errorDetails)
				}
				synthesizer.close()
			},
			(err) => {
				synthesizer.close()
				reject(err)
			}
		)
	})
}
