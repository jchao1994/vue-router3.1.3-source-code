/* @flow */

import { warn } from './warn'

const encodeReserveRE = /[!'()*]/g
const encodeReserveReplacer = c => '%' + c.charCodeAt(0).toString(16)
const commaRE = /%2C/g

// fixed encodeURIComponent which is more conformant to RFC3986:
// - escapes [!'()*]
// - preserve commas
const encode = str => encodeURIComponent(str)
  .replace(encodeReserveRE, encodeReserveReplacer) // 将[!'()*]转换为 % + 对应的unicode编码的16进制字符串
  .replace(commaRE, ',') // 保留逗号，

const decode = decodeURIComponent

export function resolveQuery ( // 将path中解析出来的query字符串和新的query对象处理成一个包含所有query键值对的对象
  query: ?string, // 新的path中解析出来的query字符串
  extraQuery: Dictionary<string> = {}, // 新的query对象
  _parseQuery: ?Function // 自定义查询字符串的解析函数
): Dictionary<string> {
  const parse = _parseQuery || parseQuery
  let parsedQuery
  try {
    parsedQuery = parse(query || '') // 处理path字符串中提取的query字符串
  } catch (e) {
    process.env.NODE_ENV !== 'production' && warn(false, e.message)
    parsedQuery = {}
  }
  for (const key in extraQuery) { // 将新的query对象中的每个key-value添加到parsedQuery对象中
    parsedQuery[key] = extraQuery[key]
  }
  return parsedQuery
}

function parseQuery (query: string): Dictionary<string> { // 处理path字符串中提取的query字符串
  const res = {}

  query = query.trim().replace(/^(\?|#|&)/, '') // 去掉query字符串两端空格以及开头的? # &

  if (!query) {
    return res
  }

  query.split('&').forEach(param => { // param为每一个key=val
    const parts = param.replace(/\+/g, ' ').split('=') // URL中的+表示空格，还原字符串，以=分割key和val
    const key = decode(parts.shift()) // 每个param的键名key
    const val = parts.length > 0 // 每个param的值val，只有key没有val的话赋值为null
      ? decode(parts.join('='))
      : null

    if (res[key] === undefined) { // a=xxx => res['a']=xxx
      res[key] = val
    } else if (Array.isArray(res[key])) { // res[key]已经是数组的情况，直接添加进去，参数数组第三个参数及以后到这里进行  res['b']=[xxx1,xxx2] => res['b']=[xxx1,xxx2,xxx3,...]
      res[key].push(val)
    } else { // 参数数组第二个参数到这里进行  b=xxx1&b=xxx2还原成数组res['b']=[xxx1,xxx2]  res['b']=xxx1 => res['b']=[xxx1,xxx2]
      res[key] = [res[key], val]
    }
  })

  return res
}

export function stringifyQuery (obj: Dictionary<string>): string { // 将obj拼接成?a=xxx&b=xxx&b=xxx&c=xxx的格式
  const res = obj ? Object.keys(obj).map(key => {
    const val = obj[key]

    if (val === undefined) { // 处理undefined
      return ''
    }

    if (val === null) { // 处理null
      return encode(key)
    }

    if (Array.isArray(val)) { // 处理数组
      const result = []
      val.forEach(val2 => {
        if (val2 === undefined) {
          return
        }
        if (val2 === null) {
          result.push(encode(key))
        } else {
          result.push(encode(key) + '=' + encode(val2)) // 数组就将多个值通过&拼接起来
        }
      })
      return result.join('&')
    }

    // 处理普通值
    return encode(key) + '=' + encode(val)
  }).filter(x => x.length > 0).join('&') : null // 过滤掉空字符串，并用&将数组拼接成字符串
  return res ? `?${res}` : '' // 起始位置加上?拼接
}
