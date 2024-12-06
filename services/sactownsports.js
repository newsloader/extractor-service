import { debug, error } from '../utils/logger.js'
import { textify } from '../utils/helper.js'
import axios from 'axios'
import { DOMParser } from 'linkedom'

import { register } from '../utils/keystore.js'

import {
  USER_AGENT,
  ARTICLE_CACHE_TTL,
  ARTICLE_SUMMARY_MIN,
  ARTICLE_SUMMARY_MAX
} from '../utils/config.js'

import { extractMetadata } from '../utils/metadata.js'

const cache = register('sactownsports-article', ARTICLE_CACHE_TTL)
const DEFAULT_TIMEOUT = 2 * 6e4
const SEPARATOR = '{{MULTIMEDIA}}'
const STOP_WORDS = 'read more below'

const parse = async (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const { url, title, description, image } = extractMetadata(doc)

  const textBlocks = []
  const mediaEmbeds = []
  let paragraphs = []

  const storyBody = doc.querySelector('div.story_body')
  if (storyBody) {
    for (const node of storyBody.childNodes) {
      const tagName = node.nodeName
      const txt = node.textContent.trim()

      // stop loop if txt contains any of the STOP_WORDS
      if (txt.toLowerCase().startsWith(STOP_WORDS)) {
        break
      }

      if (tagName === 'P') {
        paragraphs.push(txt)
      } else if (tagName === 'NOSCRIPT') { // get youtube embeds
        if (paragraphs.length > 0) {
          textBlocks.push(paragraphs.join(' '))
          paragraphs = []
        }
        mediaEmbeds.push(node.innerHTML)
        textBlocks.push(SEPARATOR)
      }
    }
  }

  if (paragraphs.length > 0) {
    textBlocks.push(paragraphs.join(' '))
    paragraphs = []
  }
  const text = textBlocks.filter(x => x !== SEPARATOR).map(line => line.trim()).join(' ')

  const content = textBlocks.map((block) => {
    return block === SEPARATOR
      ? `<p class="media">${mediaEmbeds.shift()}</p>`
      : `<p class="text">${block.trim()}</p>`
  }).join('\n')

  const desLen = description.length
  const summary = desLen > ARTICLE_SUMMARY_MIN && desLen < ARTICLE_SUMMARY_MAX
    ? description.trim() : textify(text, ARTICLE_SUMMARY_MAX).replace(/\n/g, ' ')

  return {
    url,
    title,
    description,
    image,
    summary,
    content,
  }
}

export const extract = async (url) => {
  try {
    const cached = await cache.load(url)
    if (cached) {
      debug(`sactownsports: use article data from cache: ${url}`)
      return cached
    }

    debug(`sactownsports: extract: ${url}`)
    const result = await axios.get(url, {
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Cache-Control': 'no-cache',
        'Accept': 'text/html',
      },
    })
    const { data: html = '' } = result || {}
    const data = await parse(html)
    const output = {
      error: 0,
      message: 'sactownsports article extracted',
      data,
    }
    cache.save(url, output)
    debug(`sactownsports: finished extracting article data from "${url}" via proxy server`)
    return output
  } catch (err) {
    error('sactownsports: extract', err)
    return {
      error: 1,
      message: err.message || 'extraction failed',
      data: null,
    }
  }
}
