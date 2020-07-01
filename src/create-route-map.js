/* @flow */

import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { assert, warn } from './util/warn'

export function createRouteMap(
  routes: Array<RouteConfig>, // 用户传入的routes
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {
  // the path list is used to control path matching priority
  const pathList: Array<string> = oldPathList || []
  // $flow-disable-line
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // $flow-disable-line
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  // pathList数组存放路由完整path record.path
  // pathMap对象存放完整path-record键值对，包含别名route对应的record对象
  // nameMap对象存放name-record键值对，只有真实完整path的route对应的record对象，不包含别名route对应的record对象
  // pathList pathMap nameMap已经生成
  routes.forEach(route => {
    // route = {
    //   path: string,
    //   component?: Component,
    //   name?: string, // 命名路由
    //   components?: { [name: string]: Component }, // 命名视图组件
    //   redirect?: string | Location | Function,
    //   props?: boolean | Object | Function,
    //   alias?: string | Array<string>,
    //   children?: Array<RouteConfig>, // 嵌套路由
    //   beforeEnter?: (to: Route, from: Route, next: Function) => void,
    //   meta?: any,

    //   // 2.6.0+
    //   caseSensitive?: boolean, // 匹配规则是否大小写敏感？(默认值：false)
    //   pathToRegexpOptions?: Object // 编译正则的选项
    // }
    addRouteRecord(pathList, pathMap, nameMap, route)
  })

  // ensure wildcard routes are always at the end // 把path通配符*放在pathList最后面
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  if (process.env.NODE_ENV === 'development') { // pathList中有起始不为/的path，就报警
    // warn if routes do not include leading slashes
    const found = pathList // 过滤出pathList中不是通配符*且起始不为/的完整path
      // check for missing leading slash
      .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/')

    if (found.length > 0) {
      const pathNames = found.map(path => `- ${path}`).join('\n')
      warn(false, `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`)
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }
}

function addRouteRecord(
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string
) {
  // example:
  // route: {
  // 	path: '/a',
  // 	name: 'nameA',
  // 	component: {},
  // 	alias: '/b',
  // 	children: []
  // }
  const { path, name } = route // path可能是真实path，也可能是别名alias
  if (process.env.NODE_ENV !== 'production') {
    assert(path != null, `"path" is required in a route configuration.`)
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(
        path || name
      )} cannot be a ` + `string id. Use an actual component instead.`
    )
  }

  // 编译正则选项
  // pathToRegexpOptions 的内容为：
  //  sensitive 大小写敏感(default: false)
  //  strict 末尾斜杠是否精确匹配(default: false)
  //  end 全局匹配(default: true)
  //  start 从开始位置展开匹配(default: true)
  //  delimiter 指定其他分隔符(default: '/')
  //  endsWith 指定标准的结束字符
  //  whitelist 指定分隔符列表(default: undefined, any character)
  const pathToRegexpOptions: PathToRegexpOptions =
    route.pathToRegexpOptions || {}
  // 处理path
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict) // 加上父路由获取完整path

  if (typeof route.caseSensitive === 'boolean') { // 匹配规则是否大小写敏感（默认是false）
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  const record: RouteRecord = { // 创建一个RouteRecord对象，对应routes中的每一个route
    path: normalizedPath, // 将完整的normalizedPath作为自己record的path
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions), // 根据normalizedPath和pathToRegexpOptions生成匹配路由的正则表达式
    components: route.components || { default: route.component }, // components?: { [name: string]: Component }
    instances: {},
    name, // route.name
    parent, // 父路由RouteRecord
    matchAs, // 记录路由实际指向的完整path
    redirect: route.redirect, // 用户传入的重定向，可能是字符串（普通路由），可能是对象（命名路由），也可能是方法（目标路由作为参数，return重定向的字符串路径/路径对象）
    beforeEnter: route.beforeEnter, // 路由独享的守卫，用户传入的每个route中的说守卫
    meta: route.meta || {}, // 路由元信息
    props: // route.props和route.components对应
      route.props == null
        ? {}
        : route.components
          ? route.props
          : { default: route.props }
  }

  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    // 如果路由已命名，不重定向且具有默认子路由。当用户通过路由名的方式导航到该路由，默认子路由不会被加载
    if (process.env.NODE_ENV !== 'production') {
      if (
        route.name &&
        !route.redirect &&
        route.children.some(child => /^\/?$/.test(child.path))
      ) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
          `When navigating to this named route (:to="{name: '${
          route.name
          }'"), ` +
          `the default child route will not be rendered. Remove the name from ` +
          `this route and use the name of the default child route for named ` +
          `links instead.`
        )
      }
    }
    // 遍历子路由
    route.children.forEach(child => {
      const childMatchAs = matchAs // matchAs是父路由别名的实际指向，传递给子路由
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  if (!pathMap[record.path]) {
    pathList.push(record.path) // pathList中子路由永远在父路由之前，存储的是完整path a/b/c
    pathMap[record.path] = record // pathMap key为完整path，value为record对象
  }

  // 处理别名，对具有别名的route再生成一个path为别名，matchAs为实际完整path的record，同时遍历子路由
  // 爷爷a爸爸b儿子c都有别名的情况下，最后一级record会有以下8(2**3)种情况
  //    a真path/b真path/c真path
  //    a真path/b真path/c别名
  //    a真path/b别名/c真path
  //    a真path/b别名/c别名
  //    a别名/b真path/c真path
  //    a别名/b真path/c别名
  //    a别名/b别名/c真path
  //    a别名/b别名/c别名
  // 别名会一定程度上影响vue-router的性能
  if (route.alias !== undefined) {
    const aliases = Array.isArray(route.alias) ? route.alias : [route.alias] // 将别名统一处理为数组
    for (let i = 0; i < aliases.length; ++i) {
      const alias = aliases[i]
      if (process.env.NODE_ENV !== 'production' && alias === path) { // 别名和path相同，报警
        warn(
          false,
          `Found an alias with the same value as the path: "${path}". You have to remove that alias. It will be ignored in development.`
        )
        // skip in dev to make it work
        continue
      }

      const aliasRoute = {
        path: alias, // 将别名设为path
        children: route.children
      }
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute, // route
        parent,
        record.path || '/' // matchAs
      )
    }
  }

  // 处理name 命名路由
  // 别名route没有name属性，不会执行
  if (name) {
    if (!nameMap[name]) {
      nameMap[name] = record // name对应真实完整path的record对象
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) { // 重复定义，报警
      warn(
        false,
        `Duplicate named routes definition: ` +
        `{ name: "${name}", path: "${record.path}" }`
      )
    }
  }
}

function compileRouteRegex(
  path: string, // 完整path
  pathToRegexpOptions: PathToRegexpOptions // 编译正则选项
): RouteRegExp {
  // 根据path和pathToRegexpOptions生成匹配路由的正则表达式
  // reg = Regexp('/about', [], {}) => reg = /^\/about(?:\/(?=$))?$/i
  // 匹配/about /about/
  // reg = Regexp('/about/:id', [], {}) => reg = /^\/about\/((?:[^\/]+?))(?:\/(?=$))?$/i
  // 匹配/about/xxx /about/xxx/  match可以提取出xxx的内容
  const regex = Regexp(path, [], pathToRegexpOptions)
  if (process.env.NODE_ENV !== 'production') {
    const keys: any = Object.create(null)
    regex.keys.forEach(key => { // regex.keys是什么？？？
      warn(
        !keys[key.name],
        `Duplicate param keys in route with path: "${path}"`
      )
      keys[key.name] = true
    })
  }
  return regex
}

function normalizePath( // 获取完整path  a a/b a/b/c
  path: string,
  parent?: RouteRecord,
  strict?: boolean
): string {
  if (!strict) path = path.replace(/\/$/, '') // 去除末尾/
  if (path[0] === '/') return path // 开头是/，直接返回path，子路由不能加/
  if (parent == null) return path // 开头不是/且没有parent，直接返回path
  // 开头不是/且有parent，拼接path，同时将//替换为/
  return cleanPath(`${parent.path}/${path}`)
}
