// extractor.js

import HyperExpress from 'hyper-express'

import {
  extractArticle as extractSicomArticle
} from './handlers/sicom.js'

import {
  extractArticle as extractSactownsportsArticle
} from './handlers/sactownsports.js'

import { verify } from './utils/auth.js'

import { debug, error } from './utils/logger.js'

import {
  meta, ENV, HOST, PORT, URL
} from './utils/config.js'

const server = new HyperExpress.Server()

server.get('/favicon.ico', (req, res) => {
  res.header('Content-Type', 'image/x-icon')
  return res.send('data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=')
})

server.all('/api/health', (req, res) => {
  debug(`Health check: ${req.method} ${req.path}`)
  return res.json({
    status: 'ok',
  })
})

server.get('/api/sicom/article', verify, extractSicomArticle)
server.get('/api/sactownsports/article', verify, extractSactownsportsArticle)

server.all('/', (req, res) => {
  debug(`Default: ${req.method} ${req.path}`)
  res.json(meta)
})

server.set_not_found_handler((req, res) => {
  error(`Not found: ${req.method} ${req.path}`)
  return res.status(404).json({
    error: 1,
    message: `Requested endpoint "${req.path}" does not exist`,
  })
})

server.set_error_handler((req, res, err) => {
  error(`Server error: ${err.message}`)
  return res.json({
    error: 1,
    message: 'Something went wrong',
  })
})

const onServerReady = async () => {
  debug(`Server is running at "${URL}" in ${ENV} mode`)
}

process.on('uncaughtException', (err) => {
  error(`Uncaught Exception: ${err.message}`)
  console.error(err)
  process.exit(1)
})

server.listen(PORT, HOST)
  .then(onServerReady)
  .catch((err) => {
    console.trace(err)
    error(`Failed to start web server at ${HOST}:${PORT} in ${ENV} mode`)
    error(err.message)
  })
