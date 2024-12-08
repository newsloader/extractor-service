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
  'thank you for watching',
]

const NEEDED_WORDS = [
  'coverage from',
]

const REMOVE_WORDS = [
  'from Sactown Sports',
]

const IG_URL = 'instagram.com'
const TWITTER_URL = '/status/'
const YOUTUBE_URL = 'youtube.com'

const cache = register('sactownsports-article', ARTICLE_CACHE_TTL)
const DEFAULT_TIMEOUT = 2 * 6e4
const MULTIMEDIA_SEPARATOR = '{{MULTIMEDIA}}'
const H3_TAG_SEPARATOR = '{{H3_TAG_SEPARATOR}}'

const parse = async (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const { url, title, description, image } = extractMetadata(doc)
  const textBlocks = []
  const mediaEmbeds = []
  const h3Tags = []
  let paragraphs = []

  const storyBody = doc.querySelector('div.story_body')
  if (storyBody) {
    for (const node of storyBody.childNodes) {
      const tagName = node.nodeName
      const txt = node.textContent.trim()

      if (BLOCK_WORDS.some(word => txt.toLowerCase().includes(word)) &&
        !NEEDED_WORDS.some(word => txt.toLowerCase().includes(word))) {
        continue
      }

      switch (tagName) {
        case 'P':
        case 'UL':
          paragraphs.push(txt)
          break
        case 'H3':
          paragraphs = processH3Tags({ node, h3Tags, paragraphs, textBlocks })
          break
        case 'BLOCKQUOTE':
          paragraphs = processMediaLinks({ node, paragraphs, textBlocks, mediaEmbeds, tagNameHasHref: 'a' })
          break
        case 'NOSCRIPT':
          paragraphs = processMediaLinks({ node, paragraphs, textBlocks, mediaEmbeds, tagNameHasHref: 'iframe' })
          break
        default:
          break
      }
    }
  }

  if (paragraphs.length > 0) {
    textBlocks.push(paragraphs.join(' '))
  }

  const text = textBlocks.filter(x => ![MULTIMEDIA_SEPARATOR, H3_TAG_SEPARATOR].includes(x))
    .map(line => line.trim()).join(' ')

  const content = generateContent(textBlocks, mediaEmbeds, h3Tags)
  const summary = generateSummary(description, text)

  return {
    link: url.trim(),
    title: title.trim(),
    image: image.trim(),
    summary,
    content,
  }
}

const processH3Tags = ({ node, h3Tags, paragraphs, textBlocks }) => {
  textBlocks.push(paragraphs.join(' '))
  textBlocks.push(H3_TAG_SEPARATOR)
  const txt = node.textContent.trim()
  if (txt.length > 0) {
    h3Tags.push(txt.replace(REMOVE_WORDS.join('|'), ''))
  }
  paragraphs = []
  return paragraphs
}

const processMediaLinks = ({ node, paragraphs, textBlocks, mediaEmbeds, tagNameHasHref = 'a' }) => {
  node.querySelectorAll(tagNameHasHref).forEach((atag) => {
    const href = atag.getAttribute('href')
    if (href && (href.includes(TWITTER_URL) || href.includes(IG_URL) || href.includes(YOUTUBE_URL))) {
      const mediaLink = href.split('?')[0]
      if (paragraphs.length > 0) {
        textBlocks.push(paragraphs.join(' '))
        paragraphs = []
      }
      if (isValidUrl(href)) {
        mediaEmbeds.push(mediaLink)
        textBlocks.push(MULTIMEDIA_SEPARATOR)
      }
    }
  })
  return paragraphs
}

const generateContent = (textBlocks, mediaEmbeds, h3Tags) => {
  return textBlocks.map((block) => generateBlockHTML(block, mediaEmbeds, h3Tags)).join('\n')
}

const generateBlockHTML = (block, mediaEmbeds, h3Tags) => {
  switch (block) {
    case MULTIMEDIA_SEPARATOR:
      return `<p class="media">${mediaEmbeds.shift()}</p>`
    case H3_TAG_SEPARATOR:
      return `<h3>${h3Tags.shift()}</h3>`
    default:
      return `<p class="text">${block.trim()}</p>`
  }
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
