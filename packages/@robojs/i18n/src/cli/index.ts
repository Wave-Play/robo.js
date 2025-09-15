#!/usr/bin/env node
import { i18nLogger } from '~/core/loggers.js'
import { loadLocales } from '~/core/utils.js'

const time = loadLocales()
i18nLogger.ready(`Locales built in ${time}ms`)
