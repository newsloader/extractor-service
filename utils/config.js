// config.js
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
export const {
  name,
  version,
  description,
} = require('../package.json')

const startAt = (new Date()).toISOString()

process.loadEnvFile()

const env = process.env || {}

export const ENV = env.NODE_ENV || env.ENV || 'dev'

export const meta = {
  service: `${name}@${version}`,
  description,
  startAt,
  environment: ENV,
}

export const HOST = env.HOST || '127.0.0.1'
export const PORT = Number(env.PORT || 2023)
export const URL = env.URL || `http://${HOST}:${PORT}`

export const API_KEY = env.API_KEY || 'localdev'

export const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0'

export const REDIS_URL = env.REDIS_URL || 'redis://0.0.0.0:6379'
export const REDIS_PREFIX = `${name}@${version}`

export const NEWS_ENTRIES_TIME_RANGE = 24 * 60 * 6e4

export const FEED_CACHE_TTL = 60 * 10
export const ARTICLE_CACHE_TTL = 60 * 60 * 8
export const ARTICLE_INFO_CACHE_TTL = 60 * 60 * 24

export const ARTICLE_SUMMARY_MIN = 140
export const ARTICLE_SUMMARY_MAX = 250
