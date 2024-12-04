// utils -> helper.js

import { promises } from 'node:fs'

import {
  unique,
  stripTags,
  truncate
} from '@ndaidong/bellajs'

export const isValidUrl = (url = '') => {
  try {
    const ourl = new URL(url)
    return ourl && ourl.protocol && ourl.protocol.startsWith('http')
  } catch {
    return false
  }
}

export const getTime = (t) => {
  return !t ? Date.now() : (new Date(t)).getTime()
}

export const getIsoDateTime = (t) => {
  const d = t ? new Date(t) : new Date()
  return d.toISOString()
}

export const textify = (text, len = 250) => {
  return truncate(stripTags(text).trim().replace(/\n/g, ' '), len)
}

export const textToArray = (val = '', separator = ',', toLower = true) => {
  const arr = !val ? [] : val.split(separator)
    .map(w => w.trim())
    .map(w => toLower ? w.toLowerCase() : w)
    .filter(w => w.length >= 2)
  return unique(arr)
}

export const readFileAsync = async (f) => {
  const content = await promises.readFile(f, 'utf8')
  return content || ''
}

export const writeFileAsync = async (f, content) => {
  const result = await promises.writeFile(f, content, 'utf8')
  return result
}
