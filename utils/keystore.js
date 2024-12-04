// utils -> keystore.js

import Redis from 'ioredis'
import { isObject, isArray } from '@ndaidong/bellajs'

import { debug, error } from './logger.js'

import {
  REDIS_URL,
  REDIS_PREFIX
} from './config.js'

const instance = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 5,
  retryStrategy: (times) => {
    const delay = Math.min(times * 100, 5000)
    return delay
  },
})

instance.on('connect', () => {
  debug('Connection is established to Redis server')
})
instance.on('ready', () => {
  debug('Redis server is ready to receive commands')
})
instance.on('error', () => {
  error('Error occurs while connecting to Redis server')
})
instance.on('close', () => {
  debug('Redis server connection closed')
})
instance.on('reconnecting', () => {
  debug('Reconnecting to Redis server')
})
instance.on('end', () => {
  debug('Redis server connection ended')
})

const jsonParse = (val) => {
  try {
    const data = JSON.parse(val)
    return data
  } catch (err) {
    console.error(err)
    return val
  }
}

const jsonStringify = (val) => {
  return isObject(val) || isArray(val) ? JSON.stringify(val) : val
}

const toKeyname = (key, namespace = '') => {
  return `${REDIS_PREFIX}-${namespace}-${key}`
}

const regularStore = instance.duplicate({ db: 1 })

export const register = (namespace = '', nsttl = 60) => {
  return {
    set: (key, val, ttl = nsttl) => {
      return regularStore.set(toKeyname(key, namespace), val, 'EX', ttl)
    },
    get: async (key) => {
      const val = await regularStore.get(toKeyname(key, namespace))
      return val
    },
    save: (key, val, ttl = nsttl) => {
      return regularStore.set(toKeyname(key, namespace), jsonStringify(val), 'EX', ttl)
    },
    load: async (key) => {
      const val = await regularStore.get(toKeyname(key, namespace))
      return jsonParse(val)
    },
    del: (key) => {
      return regularStore.del(toKeyname(key, namespace))
    },
  }
}
