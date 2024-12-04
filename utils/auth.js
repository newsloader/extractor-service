// utils -> auth.js

import { API_KEY } from './config.js'

export const verify = async (req, res) => {
  const { headers = {}, query_parameters: query = {} } = req
  const authorization = headers['authorization'] || ''
  const xApiKey = headers['x-api-key'] || ''
  const { apikey: qapikey } = query
  const apikey = (authorization.replace('Bearer', '') || xApiKey || qapikey || '').trim()

  if (!apikey || apikey !== API_KEY) {
    return res.json({
      status: 401,
      error: 1,
      message: 'Unauthorized',
    })
  }
  return true
}
