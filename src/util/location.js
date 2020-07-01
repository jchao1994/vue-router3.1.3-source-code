/* @flow */

import type VueRouter from '../index'
import { parsePath, resolvePath } from './path'
import { resolveQuery } from './query'
import { fillParams } from './params'
import { warn } from './warn'
import { extend } from './misc'

export function normalizeLocation (
  raw: RawLocation, // 新的URL对应的 不带基路径的完整path + query部分 + 锚部分
  current: ?Route, // 当前的route对象
  append: ?boolean,
  router: ?VueRouter // router实例
): Location {
  let next: Location = typeof raw === 'string' ? { path: raw } : raw // 将raw统一处理成obj
  // named target
  if (next._normalized) { // 已经处理过，直接返回next
    return next
  } else if (next.name) { // 处理next有name属性的情况，处理next和next.params后返回next // name优先级高于path
    next = extend({}, raw)
    const params = next.params
    if (params && typeof params === 'object') {
      next.params = extend({}, params)
    }
    return next
  }

  // relative params
  // 处理没传name和path，但传了params的情况
  // 传入path而没传name的话，会忽略传入的params属性
  if (!next.path && next.params && current) {
    next = extend({}, next)
    next._normalized = true
    const params: any = extend(extend({}, current.params), next.params) // 合并current和next上的params
    if (current.name) {
      next.name = current.name
      next.params = params
    } else if (current.matched.length) { // current存在父路由
      const rawPath = current.matched[current.matched.length - 1].path // current对应的record的完整path
      next.path = fillParams(rawPath, params, `path ${current.path}`) // 处理动态路由，返回填充好动态参数的完整path  比如 '/user/:id' => '/user/123'
    } else if (process.env.NODE_ENV !== 'production') {
      warn(false, `relative params navigation requires a current route.`)
    }
    return next
  }

  // 处理没传name但传入path的情况
  const parsedPath = parsePath(next.path || '') // 提取新的path query hash
  const basePath = (current && current.path) || '/' // 当前route对象的path
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append) // 处理绝对路径和相对路径 / ../ ./  获得最新的完整path
    : basePath // 没有新的path，就还是当前route对象的path

  const query = resolveQuery( // 将path中解析出来的query字符串parsedPath.query和新的query对象next.query处理成一个包含所有query键值对的对象
    parsedPath.query,
    next.query,
    router && router.options.parseQuery // 自定义查询字符串的解析函数
  )

  let hash = next.hash || parsedPath.hash // 优先取next.hash，没有再去找path中解析出来的hash
  if (hash && hash.charAt(0) !== '#') { // 保证hash以#开头
    hash = `#${hash}`
  }

  return {
    _normalized: true, // 处理过的标志
    path,
    query,
    hash
  }
}
