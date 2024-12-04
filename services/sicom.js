// services -> sicom.js

import axios from 'axios'
import { DOMParser } from 'linkedom'

import { register } from '../utils/keystore.js'

import { isValidUrl, textify } from '../utils/helper.js'

import { debug, error } from '../utils/logger.js'

import {
  USER_AGENT,
  ARTICLE_CACHE_TTL,
  ARTICLE_SUMMARY_MIN,
  ARTICLE_SUMMARY_MAX
} from '../utils/config.js'

const cache = register('sicom-article', ARTICLE_CACHE_TTL)

const DEFAULT_TIMEOUT = 2 * 6e4

const SEPARATOR = '{{MULTIMEDIA}}'

const blocking = [
  'don\'t miss out on any news',
  'more of the latest',
  'please let us know',
  'ensure you follow',
  'follow along to keep track',
  'this story will be updated',
  'for more coverage of',
]

const parse = async (html) => {
  const doc = new DOMParser().parseFromString(html.trim(), 'text/html')

  const metaUrl = doc.querySelector('meta[property="og:url"]')
  const url = metaUrl ? metaUrl.getAttribute('content') : ''

  const metaTitle = doc.querySelector('meta[property="og:title"]')
  const title = metaTitle ? metaTitle.getAttribute('content') : ''

  const metaDesc = doc.querySelector('meta[property="og:description"]')
  const description = metaDesc ? metaDesc.getAttribute('content') : ''

  const metaImage = doc.querySelector('meta[property="og:image"]')
  const image = metaImage ? metaImage.getAttribute('content') : ''

  const textBlocks = []
  const mediaEmbeds = []

  let paragraphs = []
  let loop = true

  doc.querySelectorAll('*[data-mm-id]').forEach((el) => {
    const tagName = el.nodeName
    if (tagName === 'H2') {
      const txt = el.textContent.trim()
      if (txt.startsWith('How to') || txt.startsWith('More')) {
        loop = false
      }
    }

    if (!loop) {
      return
    }

    if (tagName === 'P') {
      const txt = el.textContent.trim()
      const ltxt = txt.toLowerCase()
      const atext = el.querySelector('a')?.textContent?.trim()
      if (txt !== atext && txt.split(' ').length > 3 && !blocking.some(badword => ltxt.includes(badword))) {
        paragraphs.push(txt)
      }
    } else if (tagName === 'FIGURE') {
      let mediaLink = ''
      el.querySelectorAll('a').forEach((atag) => {
        const href = atag.getAttribute('href')
        if (href.indexOf('/status/') > 0) {
          const arr = href.split('?ref_src=')
          mediaLink = arr.length === 2 ? arr[0] : href

          if (paragraphs.length > 0) {
            textBlocks.push(paragraphs.join(' '))
            paragraphs = []
          }
          if (isValidUrl(href)) {
            mediaEmbeds.push(mediaLink)
            textBlocks.push(SEPARATOR)
          }
        }
      })
    }
  })

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
    link: url.trim(),
    title: title.trim(),
    image: image.trim(),
    summary,
    content,
  }
}

export const extract = async (url) => {
  try {
    const cached = await cache.load(url)
    if (cached) {
      debug(`sicom: use article data from cache: ${url}`)
      return cached
    }
    debug(`sicom: extract article data : ${url}`)
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
      message: 'si.com article extracted',
      data,
    }
    cache.save(url, output)
    debug(`sicom: finished extracting article data from "${url}" via proxy server`)
    return output
  } catch (err) {
    error(`sicom: extracting failed: "${url}"`)
    error(err.message)
    const output = {
      error: 1,
      message: err.message || 'extraction failed',
      data: null,
    }
    cache.save(url, output)
    return output
  }
}
