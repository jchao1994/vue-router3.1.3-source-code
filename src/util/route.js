/* @flow */

import type VueRouter from '../index'
import { stringifyQuery } from './query'

const trailingSlashRE = /\/?$/

export function createRoute (
  record: ?RouteRecord, // 当前的record对象
  location: Location, // 新的location对象
  redirectedFrom?: ?Location,
  router?: VueRouter
): Route {
  const stringifyQuery = router && router.options.stringifyQuery // 自定义查询字符串的反解析函数

  let query: any = location.query || {}
  try {
    query = clone(query) // 深拷贝
  } catch (e) {}

  const route: Route = { // record对象对应的route对象
    name: location.name || (record && record.name),
    meta: (record && record.meta) || {},
    path: location.path || '/',
    hash: location.hash || '', // 锚
    query, // location.query的深拷贝
    params: location.params || {},
    fullPath: getFullPath(location, stringifyQuery), // 将包含path query hash的location对象，处理成字符串形式
    matched: record ? formatMatch(record) : [] // 父级record数组 [...,爷爷record，父亲record，自己record]
  }
  if (redirectedFrom) { // 获取重定向的完整path字符串形式，包含path query hash
    route.redirectedFrom = getFullPath(redirectedFrom, stringifyQuery)
  }
  return Object.freeze(route) // 冻结route对象
}

function clone (value) { // 只能处理数组和对象的深拷贝
  if (Array.isArray(value)) { // 处理数组
    return value.map(clone)
  } else if (value && typeof value === 'object') { // 处理对象
    const res = {}
    for (const key in value) {
      res[key] = clone(value[key])
    }
    return res
  } else { // 处理普通值
    return value
  }
}

// the starting route that represents the initial state // 初始状态的route对象
export const START = createRoute(null, {
  path: '/'
})

function formatMatch (record: ?RouteRecord): Array<RouteRecord> { // 父级数组 [...,爷爷record，父亲record，自己record]
  const res = []
  while (record) {
    res.unshift(record)
    record = record.parent
  }
  return res
}

function getFullPath ( // 将包含path query hash的对象，处理成字符串形式
  { path, query = {}, hash = '' },
  _stringifyQuery // 自定义查询字符串的反解析函数
): string {
  const stringify = _stringifyQuery || stringifyQuery // 将query拼接成?a=xxx&b=xxx&c=xxx的格式
  return (path || '/') + stringify(query) + hash
}

export function isSameRoute (a: Route, b: ?Route): boolean {
  if (b === START) {
    return a === b
  } else if (!b) {
    return false
  } else if (a.path && b.path) {
    return (
      a.path.replace(trailingSlashRE, '') === b.path.replace(trailingSlashRE, '') &&
      a.hash === b.hash &&
      isObjectEqual(a.query, b.query)
    )
  } else if (a.name && b.name) {
    return (
      a.name === b.name &&
      a.hash === b.hash &&
      isObjectEqual(a.query, b.query) &&
      isObjectEqual(a.params, b.params)
    )
  } else {
    return false
  }
}

function isObjectEqual (a = {}, b = {}): boolean {
  // handle null value #1566
  if (!a || !b) return a === b
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) {
    return false
  }
  return aKeys.every(key => {
    const aVal = a[key]
    const bVal = b[key]
    // check nested equality
    if (typeof aVal === 'object' && typeof bVal === 'object') {
      return isObjectEqual(aVal, bVal)
    }
    return String(aVal) === String(bVal)
  })
}

export function isIncludedRoute (current: Route, target: Route): boolean { // current是否包含target
  return (
    current.path.replace(trailingSlashRE, '/').indexOf( // target包含在current开头
      target.path.replace(trailingSlashRE, '/')
    ) === 0 &&
    (!target.hash || current.hash === target.hash) && // target没有hash或者等于current的hash
    queryIncludes(current.query, target.query) // target.query包含在current.query中
  )
}

function queryIncludes (current: Dictionary<string>, target: Dictionary<string>): boolean {
  for (const key in target) {
    if (!(key in current)) {
      return false
    }
  }
  return true
}
