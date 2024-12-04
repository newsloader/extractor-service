// handlers -> sicom.js

import { extract } from '../services/sicom.js'

import { debug } from '../utils/logger.js'

export const extractArticle = async (req, res) => {
  const { method, url: rurl, query_parameters: query = {} } = req
  debug(`${method} --> ${rurl}`)
  const { url } = query
  const result = await extract(url)
  return res.json(result)
}
