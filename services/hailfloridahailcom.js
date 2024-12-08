import axios from 'axios'
import { DOMParser } from 'linkedom'

import { register } from '../utils/keystore.js'
import { textify } from '../utils/helper.js'
import { debug, error } from '../utils/logger.js'

import {
  USER_AGENT,
  ARTICLE_CACHE_TTL,
  ARTICLE_SUMMARY_MIN,
  ARTICLE_SUMMARY_MAX
} from '../utils/config.js'

const cache = register('hailflorida-article', ARTICLE_CACHE_TTL)

const DEFAULT_TIMEOUT = 2 * 6e4

// Common text patterns to filter out
const blocking = [
  'would you like me to modify',
  'for more information',
  'follow along',
  'stay tuned',
  'more coverage',
  'this story will be updated',
  'read more:',
  'related:',
  'you might also like',
]

const getMetaContent = (doc, property) => {
  // Try multiple meta tag formats
  const selectors = [
    `meta[property="${property}"]`,
    `meta[name="${property}"]`,
    `meta[property="og:${property}"]`,
    `meta[name="og:${property}"]`,
    `meta[property="twitter:${property}"]`,
    `meta[name="twitter:${property}"]`,
  ]

  for (const selector of selectors) {
    const meta = doc.querySelector(selector)
    if (meta?.getAttribute('content')) {
      return meta.getAttribute('content')
    }
  }
  return ''
}

const findTitle = (doc) => {
  return (
    doc.querySelector('article h1')?.textContent?.trim() ||
    doc.querySelector('main h1')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    getMetaContent(doc, 'title') ||
    doc.querySelector('title')?.textContent?.trim() ||
    ''
  )
}

const findDescription = (doc) => {
  return (
    doc.querySelector('article h1 + div')?.textContent?.trim() ||
    ''
  )
}

const findImage = (doc) => {
  const mainImage =
    doc.querySelector('article img') ||
    doc.querySelector('main img') ||
    doc.querySelector('[role="img"]') ||
    doc.querySelector('img[width="100%"]') ||
    doc.querySelector('img[class*="hero"]') ||
    doc.querySelector('img[class*="featured"]')

  return {
    url: mainImage?.getAttribute('src') || getMetaContent(doc, 'image') || '',
    alt: mainImage?.getAttribute('alt') || '',
  }
}

// const findAuthorInfo = (doc) => {
//   const authorInfo =
//     doc.querySelector('[itemtype*="Person"]')?.textContent?.trim() ||
//     getMetaContent(doc, 'author') ||
//     doc.querySelector('[rel="author"]')?.textContent?.trim() ||
//     doc.querySelector('.author, .byline')?.textContent?.trim() ||
//     ''

//   const publishDate =
//     doc.querySelector('time')?.getAttribute('datetime') ||
//     getMetaContent(doc, 'published_time') ||
//     getMetaContent(doc, 'date') ||
//     doc.querySelector('[itemprop="datePublished"]')?.getAttribute('content') ||
//     ''

//   return { author: authorInfo, publishDate }
// }

const extractTwitterEmbeds = (doc) => {
  const twitterEmbeds = []

  // Find all blockquotes with twitter-tweet class
  doc.querySelectorAll('blockquote.twitter-tweet').forEach((blockquote) => {
    const tweetText = blockquote.querySelector('p')?.textContent?.trim()
    // Get links from blockquote
    const links1 = blockquote.querySelectorAll('a')
    const tweetUrl = links1[links1.length - 1]?.getAttribute('href')

    if (tweetText) {
      twitterEmbeds.push({
        text: tweetText,
        url: tweetUrl || '', // Fallback to empty string if no URL found
      })
    }
  })

  return twitterEmbeds
}

const findMainArticleContent = (doc) => {
  const mainContent = doc.querySelector('main')

  return mainContent
}

const getArticleContent = (doc) => {
  const textBlocks = []
  const mainContent = findMainArticleContent(doc)

  if (!mainContent) {
    return { textBlocks: [], twitterEmbeds: [] }
  }

  // Extract Twitter embeds before removing them
  const twitterEmbeds = extractTwitterEmbeds(mainContent)

  // Clone the content to avoid modifying original
  const contentClone = mainContent.cloneNode(true)

  // Remove Twitter embeds from content
  contentClone
    .querySelectorAll('.twitter-tweet, [data-tweet-id], iframe[src*="twitter"], blockquote[class*="twitter"]')
    .forEach((el) => el.parentNode?.removeChild(el))

  // Find all content paragraphs
  const contentElements = contentClone.querySelectorAll('p[data-mm-id], h2[data-mm-id], h3[data-mm-id], h4[data-mm-id]')

  let hasFoundContent = false
  contentElements.forEach((el) => {
    const text = el.textContent.trim()
    const tagName = el.tagName.toLowerCase()

    // Skip empty or too short content
    if (!text || text.length < 10) return

    // Skip blocked content
    if (blocking.some((b) => text.toLowerCase().includes(b))) return

    // Skip sharing buttons or related content text
    if (
      text.toLowerCase().includes('share') ||
      text.toLowerCase().includes('related')
    )
      return

    // Skip likely navigation text
    if (
      text.toLowerCase().includes('next:') ||
      text.toLowerCase().includes('previous:')
    )
      return

    // If this is valid content, mark that we've found content
    hasFoundContent = true

    textBlocks.push({
      type: tagName,
      content: text,
    })
  })

  // If we haven't found any valid content, try a more lenient approach
  if (!hasFoundContent) {
    contentClone.querySelectorAll('p').forEach((p) => {
      const text = p.textContent.trim()
      if (
        text &&
        text.length > 10 &&
        !blocking.some((b) => text.toLowerCase().includes(b))
      ) {
        textBlocks.push({
          type: 'p',
          content: text,
        })
      }
    })
  }

  return {
    textBlocks,
    twitterEmbeds,
  }
}

const parse = async (html) => {
  const doc = new DOMParser().parseFromString(html.trim(), 'text/html')

  const title = findTitle(doc)
  const description = findDescription(doc)
  const { url: imageUrl } = findImage(doc)
  // const { author, publishDate } = findAuthorInfo(doc)
  const { textBlocks, twitterEmbeds } = getArticleContent(doc)

  // Generate HTML content
  const content = textBlocks
    .map((block) => {
      return `<${block.type}>${block.content}</${block.type}>`
    })
    .join('\n')

  // Generate plain text for summary
  const text = textBlocks.map((block) => block.content).join(' ')

  // Create appropriate length summary
  const desLen = description.length
  const summary =
    desLen > ARTICLE_SUMMARY_MIN && desLen < ARTICLE_SUMMARY_MAX
      ? description
      : textify(text, ARTICLE_SUMMARY_MAX).replace(/\n/g, ' ')

  // Get canonical URL
  const canonical =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''

  return {
    link: canonical,
    title,
    image: imageUrl,
    summary,
    content,
    metadata: {
      twitterEmbeds,
    },
  }
}

export const extract = async (url) => {
  try {
    const cached = await cache.load(url)
    if (cached) {
      debug(`hailflorida: use article data from cache: ${url}`)
      return cached
    }

    debug(`hailflorida: extract article data: ${url}`)
    const result = await axios.get(url, {
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Cache-Control': 'no-cache',
        Accept: 'text/html',
      },
    })

    const { data: html = '' } = result || {}
    const data = await parse(html)

    const output = {
      error: 0,
      message: 'article extracted successfully',
      data,
    }

    cache.save(url, output)
    debug(
      `hailflorida: finished extracting article data from "${url}" via proxy server`
    )
    return output
  } catch (err) {
    error(`hailflorida: extracting failed: "${url}"`)
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
