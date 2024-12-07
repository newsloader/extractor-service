export const extractMetadata = (doc) => {
  const metaUrl = doc.querySelector('meta[property="og:url"]')
  const url = metaUrl ? metaUrl.getAttribute('content') : ''

  const metaTitle = doc.querySelector('meta[property="og:title"]')
  const title = metaTitle ? metaTitle.getAttribute('content') : ''

  const metaDesc = doc.querySelector('meta[property="og:description"]')
  const description = metaDesc ? metaDesc.getAttribute('content') : ''

  const metaImage = doc.querySelector('meta[property="og:image"]')
  const image = metaImage ? metaImage.getAttribute('content') : ''

  return { url, title, description, image }
}
