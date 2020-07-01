/* @flow */

import type VueRouter from './index'
import { resolvePath } from './util/path'
import { assert, warn } from './util/warn'
import { createRoute } from './util/route'
import { fillParams } from './util/params'
import { createRouteMap } from './create-route-map'
import { normalizeLocation } from './util/location'

export type Matcher = {
  match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
  addRoutes: (routes: Array<RouteConfig>) => void;
};

export function createMatcher (
  // const routes = [
  //   { path: '/goods', component: goods },
  //   { path: '/rating', component: rating },
  //   { path: '*', redirect: '/goods' }
  // ]
  routes: Array<RouteConfig>, // 用户传入的routes
  router: VueRouter // router实例
): Matcher {
  // createRouteMap对每个route生成一个record对象
  // pathList数组存放路由完整path record.path
  // pathMap对象存放完整path-record键值对，包含别名route对应的record对象
  // nameMap对象存放name-record键值对，只有真实完整path的route对应的record对象，不包含别名route对应的record对象
  const { pathList, pathMap, nameMap } = createRouteMap(routes)

  function addRoutes (routes) { // 对比原先的pathList pathMap nameMap，如果有不存在的，就添加
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

  function match ( // 核心代码  对比老的route对象和新的location对象，生成新的route对象(Object.freeze处理过的)
    raw: RawLocation, // 新的URL对应的 不带基路径的完整path + query部分 + 锚部分，也可能是对象
    currentRoute?: Route, // 当前的route对象
    redirectedFrom?: Location
  ): Route {
    const location = normalizeLocation(raw, currentRoute, false, router) // 处理不同情况的下的raw
    const { name } = location

    if (name) { // 处理有name属性的情况
      const record = nameMap[name] // 获取name对应的record对象
      if (process.env.NODE_ENV !== 'production') {
        warn(record, `Route with name '${name}' does not exist`)
      }
      if (!record) return _createRoute(null, location) // nameMap中没有name对应的record对象
      // 获取所有必须的params。如果optional为true说明params不是必须的？？？
      const paramNames = record.regex.keys // ???
        .filter(key => !key.optional)
        .map(key => key.name)

      if (typeof location.params !== 'object') {
        location.params = {}
      }

      // raw中有name的情况会执行到这里，此时location.params只有新的params，需要添加当前current中必须的params
      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      location.path = fillParams(record.path, location.params, `named route "${name}"`) // 填充动态参数，返回完整path
      return _createRoute(record, location, redirectedFrom)
    } else if (location.path) { // 处理没有name且有path的情况，忽略传入的parmas
      location.params = {}
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path]
        if (matchRoute(record.regex, location.path, location.params)) { // 在已经生成的record对象中匹配到新的path
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // no match // matchRoute没有匹配到新的location.path，根据location生成一个新的没有record的route对象
    return _createRoute(null, location)
  }

  function redirect (
    record: RouteRecord,
    location: Location // redirectedFrom
  ): Route {
    const originalRedirect = record.redirect // 用户传入的重定向
    let redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router)) // 重定向为function，就传入目标路由，并且返回值为重定向的路由
      : originalRedirect

    if (typeof redirect === 'string') { // 普通路由处理成对象形式，命名路由本身就已经是对象形式了
      redirect = { path: redirect }
    }

    // 此时redirect已经统一处理为对象形式 { path: xxx }
    if (!redirect || typeof redirect !== 'object') {
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false, `invalid redirect option: ${JSON.stringify(redirect)}`
        )
      }
      return _createRoute(null, location) // 根据location生成一个新的没有record的route对象
    }

    const re: Object = redirect
    const { name, path } = re
    let { query, hash, params } = location
    // 优先取用户传入的redirect中的query hash params
    query = re.hasOwnProperty('query') ? re.query : query
    hash = re.hasOwnProperty('hash') ? re.hash : hash
    params = re.hasOwnProperty('params') ? re.params : params

    if (name) { // 处理重定向命名路由，优先处理name
      // resolved named direct
      const targetRecord = nameMap[name] // 从nameMap中取到对应命名路由
      if (process.env.NODE_ENV !== 'production') {
        assert(targetRecord, `redirect failed: named route "${name}" not found.`)
      }
      return match({ // 走有name属性的流程生成route对象
        _normalized: true, // raw
        name,
        query,
        hash,
        params
      }, undefined, location) // currentRoute redirectedFrom 
    } else if (path) { // 处理重定向普通路由
      // 1. resolve relative redirect // 处理绝对和相对路径
      const rawPath = resolveRecordPath(path, record)
      // 2. resolve params // 填充动态参数
      const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`)
      // 3. rematch with existing query and hash
      return match({ // 走没有name且有path的流程生成route对象
        _normalized: true,
        path: resolvedPath,
        query,
        hash
      }, undefined, location)
    } else { // 没有name也没有path，报警，根据location生成一个新的没有record的route对象
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      return _createRoute(null, location)
    }
  }

  function alias (
    record: RouteRecord, // 当前的record
    location: Location, // 新的location
    matchAs: string // 当前record对应的实际路由
  ): Route {
    const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`) // 对实际路径填充动态参数
    const aliasedMatch = match({ // 在已经生成的record对象中匹配aliasedPath，生成route对象，没有匹配到生成一个只传path就生成的route对象
      _normalized: true,
      path: aliasedPath
    })
    // aliasedMatch是别名record对应的真实record对应的route对象
    if (aliasedMatch) {
      const matched = aliasedMatch.matched // 父级record数组
      const aliasedRecord = matched[matched.length - 1] // 自己对应的record
      location.params = aliasedMatch.params // 替换location.params
      return _createRoute(aliasedRecord, location) // 结合别名record对应的真实record和location生成一个新的route对象
    }
    // 没有匹配到，返回根据location生成一个新的没有record的route对象
    return _createRoute(null, location)
  }

  function _createRoute (
    record: ?RouteRecord, // 当前的record
    location: Location, // 新的location
    redirectedFrom?: Location // 新传入的重定向
  ): Route {
    if (record && record.redirect) { // 处理重定向  record.redirect是用户传入的重定向
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) { // 处理别名
      return alias(record, location, record.matchAs)
    }
    // 常规处理
    return createRoute(record, location, redirectedFrom, router) // 结合当前的record和新的location，生成一个新的route对象
  }

  return {
    match,
    addRoutes
  }
}

function matchRoute (
  regex: RouteRegExp, // 编译正则选项
  path: string, // 新的处理完的完整path
  params: Object // 新的处理完的params
): boolean {
  const m = path.match(regex) // 在已传入的每个route对象对应的record的regex匹配路由规则中匹配新的路由，返回匹配据结果

  if (!m) { // 没有匹配到，返回false
    return false
  } else if (!params) { // 匹配到且没有params，返回true
    return true
  }

  // 匹配到且有params 提取动态路由
  for (let i = 1, len = m.length; i < len; ++i) { // 遍历分组结果（除了匹配结果第一项，也就是完整匹配结果）
    const key = regex.keys[i - 1]
    const val = typeof m[i] === 'string' ? decodeURIComponent(m[i]) : m[i] // 分组匹配到的val，也就是动态路由
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      params[key.name || 'pathMatch'] = val // 没有name，就视为通配符*的路由名
    }
  }

  return true
}

function resolveRecordPath (path: string, record: RouteRecord): string {
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
