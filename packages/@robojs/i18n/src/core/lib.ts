// @ts-expect-error - This is a generated file
import type { LocaleKey, ParamsFor } from '../../generated/types'
import { getFormatter } from './formatter.js'
import { i18nLogger } from './loggers.js'
import {
	flattenParams,
	getLocale,
	loadLocales,
	loadLocalNames,
	mapKeysToSanitized,
	sanitizeDottedArgs
} from './utils.js'
import { join } from 'node:path'
import { createCommandConfig as _createCommandConfig, getPluginOptions, State } from 'robo.js'
import type { BaseFromLocale, LocaleCommandConfig, LocaleLike, PluginConfig, ValidatedCommandConfig } from './types'
import type { SmartCommandConfig } from 'robo.js'

let _isLoaded = false

export function createCommandConfig<const C extends LocaleCommandConfig>(config: ValidatedCommandConfig<C>) {
	// Load locales only once
	if (!_isLoaded) {
		loadLocales()
		_isLoaded = true
	}

	// Validate config
	const localNames = loadLocalNames()
	const descriptionKey = config.descriptionKey
	const pluginConfig = getPluginOptions(join('@robojs', 'i18n')) as PluginConfig
	const defaultLocale = pluginConfig?.defaultLocale || 'en-US'
	config.description = t(defaultLocale, config.descriptionKey)

	localNames.forEach((locale: string) => {
		if (descriptionKey) {
			const description = t(locale, descriptionKey)
			config.descriptionLocalizations = config.descriptionLocalizations || {}
			config.descriptionLocalizations[locale] = description
		}

		delete config.descriptionKey
	})

	if (config && config.options) {
		config.options.forEach((option) => {
			localNames.forEach((locale: string) => {
				const nameKey = option.nameKey
				const descriptionKey = option.descriptionKey
				const name = t(locale, nameKey)
				const description = t(locale, descriptionKey)

				option.nameLocalizations = option.nameLocalizations || {}
				option.nameLocalizations[locale] = name
				option.descriptionLocalizations = option.descriptionLocalizations || {}
				option.descriptionLocalizations[locale] = description
			})

			// @ts-expect-error - We know these keys exist
			option.description = t(defaultLocale, option.descriptionKey)
			option.name = t(defaultLocale, option.nameKey)

			delete option.nameKey
			delete option.descriptionKey
		})
	}

	i18nLogger.debug('Creating localized command config:', { config })
	return _createCommandConfig(config as unknown as SmartCommandConfig<BaseFromLocale<C>>)
}

export function t<K extends LocaleKey>(locale: LocaleLike, key: K, params?: ParamsFor<K>): string {
	const localeValues = State.get<Record<string, Record<string, string>>>('localeValues', {
		namespace: '@robojs/i18n'
	})

	// This function should return the translation for the given locale and key.
	// For now, we will just return a placeholder string.
	const localeStr = getLocale(locale)
	const values = localeValues[localeStr]
	if (!values) {
		throw new Error(`Locale "${localeStr}" not found`)
	}
	const translation = values[key]
	if (!translation) {
		throw new Error(`Translation for key "${key}" not found in locale "${localeStr}"`)
	}

	if (params) {
		const flat = flattenParams(params as Record<string, unknown>)
		const safeMsg = sanitizeDottedArgs(translation)
		const safeValues = mapKeysToSanitized(flat)
		const formatter = getFormatter(localeStr, String(key), safeMsg)

		return formatter.format(safeValues) as string
	}

	return translation
}

export function withLocale(local: LocaleLike) {
	return <K extends LocaleKey>(key: K, params?: ParamsFor<K>) => t(local, key, params)
}
