/* @flow */

import type VueRouter from '../index'
import { parsePath, resolvePath } from './path'
import { resolveQuery } from './query'
import { fillParams } from './params'
import { extend } from './misc'

export function normalizeLocation(
  raw: RawLocation,
  current: ?Route,
  append: ?boolean,
  router: ?VueRouter
) {
  let next = typeof raw === 'string' ? { path: raw } : raw

  if (next._normalized) {
    return next
  }

  // 如果是通过name的方式，传参只能通过param的方式
  if (next.name) {
    next = extend({}, raw)
    const params = next.params
    if (params && typeof params === 'object') {
      next.params = extend({}, params)
    }
    return next
  }
  /**
   * 没有name同时没有path
   * 通过{name:"name",params:{a:1}}的方式通过路由跳转
   * 如果location中没有传入path或者name使用当前路由的name或者path，优先使用name
   */
  if (!next.path && next.params && current) {
    next = extend({}, next)
    next._normalized = true
    const params = extend(extend({}, current.params), next.params)
    if (current.name) {
      next.name = current.name
      next.params = params
    } else if (current.matched.length) {
      const rawPath = current.matched[current.matched.length - 1].path
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    }
    return next
  }

  // 通过path的方式，传参只能通过query的方式
  // 解析出路径中的hash和query
  const parsedPath: { path: String, query: ?String, hash: ?string } = parsePath(
    next.path || ''
  )

  const basePath = (current && current.path) || '/'
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath

  // 路径配置的query优先
  const query = resolveQuery(
    parsedPath.query,
    next.query,
    router && router.options.parseQuery
  )

  // 路径配置的hash优先
  let hash = next.hash || parsedPath.hash
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  return {
    _normalized: true,
    path,
    query,
    hash
  }
}
