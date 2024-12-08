import { debug, error } from '../utils/logger.js'
import { textify, isValidUrl } from '../utils/helper.js'
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

const BLOCK_WORDS = [
  'thank you for reading',
  '–field level',
  'the full interview',
  'follow @',
  'full interview',
  'click here for',
  'sactown sports',
]

const cache = register('sactownsports-article', ARTICLE_CACHE_TTL)
const DEFAULT_TIMEOUT = 2 * 6e4
const SEPARATOR = '{{MULTIMEDIA}}'

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

      if (BLOCK_WORDS.some(word => txt.toLowerCase().includes(word))) {
        continue
      }

      switch (tagName) {
        case 'P':
        case 'UL':
        case 'H3':
          paragraphs.push(txt)
          break
        case 'BLOCKQUOTE':
          paragraphs = processBlockquote({ node, paragraphs, textBlocks, mediaEmbeds })
          break
        case 'NOSCRIPT':
          paragraphs = processNoscript({ node, paragraphs, textBlocks, mediaEmbeds })
          break
        default:
          break
      }
    }
  }

  if (paragraphs.length > 0) {
    textBlocks.push(paragraphs.join(' '))
  }

  const text = textBlocks.filter(x => x !== SEPARATOR).map(line => line.trim()).join(' ')
  const content = generateContent(textBlocks, mediaEmbeds)

  const summary = generateSummary(description, text)

  return {
    link: url.trim(),
    title: title.trim(),
    image: image.trim(),
    summary,
    content,
  }
}

const processBlockquote = ({ node, paragraphs, textBlocks, mediaEmbeds }) => {
  node.querySelectorAll('a').forEach((atag) => {
    const href = atag.getAttribute('href')
    if (href && href.includes('/status/')) {
      const mediaLink = href.split('?ref_src=')[0]
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
  return paragraphs
}

const processNoscript = ({ node, paragraphs, textBlocks, mediaEmbeds }) => {
  const mediaLink = node.querySelector('iframe')?.getAttribute('src')

  if (mediaLink && mediaLink.includes('youtube.com')) {
    if (paragraphs.length > 0) {
      textBlocks.push(paragraphs.join(' '))
      paragraphs = []
    }
    if (isValidUrl(mediaLink)) {
      mediaEmbeds.push(mediaLink)
      textBlocks.push(SEPARATOR)
    }
  }
  return paragraphs
}

const generateContent = (textBlocks, mediaEmbeds) => {
  return textBlocks.map((block) => {
    return block === SEPARATOR
      ? `<p class="media">${mediaEmbeds.shift()}</p>`
      : `<p class="text">${block.trim()}</p>`
  }).join('\n')
}

const generateSummary = (description, text) => {
  const desLen = description.length
  return desLen > ARTICLE_SUMMARY_MIN && desLen < ARTICLE_SUMMARY_MAX
    ? description.trim()
    : textify(text, ARTICLE_SUMMARY_MAX).replace(/\n/g, ' ')
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
