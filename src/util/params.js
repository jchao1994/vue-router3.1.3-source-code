/* @flow */

import { warn } from './warn'
import Regexp from 'path-to-regexp'

// $flow-disable-line
const regexpCompileCache: {
  [key: string]: Function
} = Object.create(null)

export function fillParams (
  path: string, // 子路由完整path
  params: ?Object,
  routeMsg: string
): string {
  params = params || {}
  try {
    const filler = // 处理动态路由
      regexpCompileCache[path] ||
      (regexpCompileCache[path] = Regexp.compile(path)) // 将path转换为正则表达式的function  Regexp.compile('/user/:id')({id:123}) => '/user/123'

    // Fix #2505 resolving asterisk routes { name: 'not-found', params: { pathMatch: '/not-found' }}
    if (params.pathMatch) params[0] = params.pathMatch // 传入params.pathMatch用来替换路由中的*

    return filler(params, { pretty: true }) // 返回填充好参数的完整path
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      // Fix #3072 no warn if `pathMatch` is string
      warn(typeof params.pathMatch === 'string', `missing param for ${routeMsg}: ${e.message}`)
    }
    return ''
  } finally {
    // delete the 0 if it was added
    delete params[0]
  }
}
