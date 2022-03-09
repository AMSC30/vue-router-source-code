/* @flow */

import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { warn } from './util/warn'

export function createRouteMap(
  routes,
  oldPathList,
  oldPathMap,
  oldNameMap,
  parentRoute
) {
  const pathList = oldPathList || []
  const pathMap = oldPathMap || Object.create(null)
  const nameMap = oldNameMap || Object.create(null)

  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route, parentRoute)
  })

  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // warn if routes do not include leading slashes
    const found = pathList
      // check for missing leading slash
      .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/')

    if (found.length > 0) {
      const pathNames = found.map(path => `- ${path}`).join('\n')
      warn(
        false,
        `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`
      )
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }
}
/**
 * 这个函数的本质是将传入的路由配置与父路由记录结合生成新的路径，路由配置生成新的路由记录
 * 并保存在路由表中，针对的是单个路由配置对象
 * */

function addRouteRecord(
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string
) {
  const { path, name } = route

  const pathToRegexpOptions: PathToRegexpOptions =
    route.pathToRegexpOptions || {}

  // 1.拼接路径
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict)

  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  // 2.根据路由配置生成路由记录
  const record: RouteRecord = {
    path: normalizedPath,
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),

    // 对component结构的处理，components选项拥有高优先级
    components: route.components || { default: route.component },

    // alias处理成一个数组
    alias: route.alias
      ? typeof route.alias === 'string'
        ? [route.alias]
        : route.alias
      : [],
    instances: {},
    enteredCbs: {},
    name,
    parent,
    matchAs,
    redirect: route.redirect,
    beforeEnter: route.beforeEnter,
    meta: route.meta || {},
    props:
      route.props == null
        ? {}
        : route.components
        ? route.props
        : { default: route.props }
  }

  // 3.递归子路由配置生成新的路由记录，所以子path在pathList前面
  if (route.children) {
    route.children.forEach(child => {
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  // 4.将当前路由记录添加到映射表中
  if (!pathMap[record.path]) {
    pathList.push(record.path)
    pathMap[record.path] = record
  }
  if (name && !nameMap[name]) {
    nameMap[name] = record
  }

  // 5.将别名作为新的路径，作为一个新的路由配置，创建别名的路由记录添加到路由表中
  if (route.alias !== undefined) {
    const aliases = Array.isArray(route.alias) ? route.alias : [route.alias]
    for (let i = 0; i < aliases.length; ++i) {
      const alias = aliases[i]
      const aliasRoute = {
        path: alias,
        children: route.children
      }
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      )
    }
  }
}

function compileRouteRegex(
  path: string,
  pathToRegexpOptions: PathToRegexpOptions
): RouteRegExp {
  const regex = Regexp(path, [], pathToRegexpOptions)
  if (process.env.NODE_ENV !== 'production') {
    const keys: any = Object.create(null)
    regex.keys.forEach(key => {
      warn(
        !keys[key.name],
        `Duplicate param keys in route with path: "${path}"`
      )
      keys[key.name] = true
    })
  }
  return regex
}

/**
 * 与父路径拼接，可能以“/”开头也可能不是
 * */
function normalizePath(
  path: string,
  parent?: RouteRecord,
  strict?: boolean
): string {
  // 去掉末尾的slash
  if (!strict) path = path.replace(/\/$/, '')

  if (path[0] === '/' || parent == null) return path

  // 不是以slash开头同时有父路由，才进行拼接
  return cleanPath(`${parent.path}/${path}`)
}
