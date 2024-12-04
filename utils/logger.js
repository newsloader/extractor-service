// logger.js

import { logger } from 'nonalog'

import { meta } from './config.js'

const { service } = meta

const wlogger = logger(service)

export const error = wlogger.error
export const info = wlogger.info
export const debug = wlogger.debug
