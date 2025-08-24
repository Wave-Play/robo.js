// @ts-expect-error - This is a generated file
import type { Locale, LocaleKey } from '../../generated/types'
import { i18nLogger } from './loggers.js'
import { loadLocales, loadLocalNames } from './utils.js'
import { join } from 'node:path'
import { IntlMessageFormat } from 'intl-messageformat'
import { CommandConfig, CommandOption, getPluginOptions, State } from 'robo.js'

type Autocomplete<T extends string> = T | (string & NonNullable<unknown>)
type LocaleStr = Extract<Locale, string>

export type LocaleLike =
	| Locale
	| {
		locale: Autocomplete<LocaleStr>
	}
	| {
		guildLocale: Autocomplete<LocaleStr>
	}

export function t(locale: LocaleLike, key: LocaleKey, params?: Record<string, unknown>): string {
	const localeValues = State.get<Map<string, Record<string, string>>>('localeValues', {
		namespace: '@robojs/i18n'
	})

	// This function should return the translation for the given locale and key.
	// For now, we will just return a placeholder string.
	const localeStr = getLocale(locale)
	const values = localeValues.get(localeStr)
	if (!values) {
		throw new Error(`Locale "${localeStr}" not found`)
	}
	const translation = values[key]
	if (!translation) {
		throw new Error(`Translation for key "${key}" not found in locale "${localeStr}"`)
	}


	if (params) {
		const formatter = new IntlMessageFormat(translation, localeStr).format(params);
		return formatter as string
	}

	return translation
}

function getLocale(input: Locale): Locale
function getLocale(input: { locale: string } | { guildLocale: string }): string
function getLocale(input: LocaleLike): string
function getLocale(input: LocaleLike): string {
	if (typeof input === 'string') return input
	if ('locale' in input && typeof input.locale === 'string') return input.locale
	if ('guildLocale' in input && typeof input.guildLocale === 'string') {
		return input.guildLocale
	}
	throw new TypeError('Invalid LocaleLike')
}

export function withLocale(local: LocaleLike) {
	return (key: LocaleKey, params?: Record<string, unknown>) => {
		return t(local, key, params);
	};
}

// This function is used to create a command config with localized names and descriptions
interface O extends Omit<CommandOption, | 'name'> {
	name?: string,
	nameKey: LocaleKey,
	descriptionKey?: LocaleKey,
}

interface C extends Omit<CommandConfig, | 'options'> {
	descriptionKey?: LocaleKey,
	options?: readonly O[],

}

interface pluginConfig {
	defaultLocale?: string
}

export function localeCreateCommandConfig(config: C) {
	loadLocales();
	const localNames = loadLocalNames();
	const descriptionKey = config.descriptionKey

	const pluginConfig = getPluginOptions(join('@robojs', 'i18n')) as pluginConfig;
	const defaultLocale = pluginConfig?.defaultLocale || 'en-US';

	config.description = t(defaultLocale, config.descriptionKey)

	localNames.forEach((locale: string) => {
		if (descriptionKey) {
			const description = t(locale, descriptionKey)
			config.descriptionLocalizations = config.descriptionLocalizations || {}
			config.descriptionLocalizations[locale] = description
		}
		delete config.descriptionKey
	});


	if (config && config.options) {
		config.options.forEach((option) => {
			localNames.forEach((locale: string) => {
				const nameKey = option.nameKey;
				const descriptionKey = option.descriptionKey;

				const name = t(locale, nameKey);
				const description = t(locale, descriptionKey);
				option.nameLocalizations = option.nameLocalizations || {}
				option.nameLocalizations[locale] = name
				option.descriptionLocalizations = option.descriptionLocalizations || {}
				option.descriptionLocalizations[locale] = description
			});

			option.description = t(defaultLocale, option.descriptionKey)
			option.name = t(defaultLocale, option.nameKey)

			delete option.nameKey
			delete option.descriptionKey
		});

	}

	i18nLogger.error('Creating command config with localized names and descriptions', {
		config
	});

	return config as CommandConfig;

}
