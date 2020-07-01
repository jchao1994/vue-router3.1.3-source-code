/* @flow */

export function resolvePath ( // 处理路径
  relative: string, // 新的path
  base: string, // 当前route对象的path
  append?: boolean // true表示base是relative的父路由
): string {
  const firstChar = relative.charAt(0)
  if (firstChar === '/') { // relative开头为/，绝对路径
    return relative
  }

  if (firstChar === '?' || firstChar === '#') { // relative开头为?或#，表示query或hash
    return base + relative
  }

  const stack = base.split('/')

  // remove trailing segment if:
  // - not appending
  // - appending to trailing slash (last segment is empty)
  // append为true，表示base是relative的父路由
  // append为undefined，表示base和relative是同级路由，一定要将base的最后一级路由去掉
  // base最后为/，去掉分割之后的数组的最后一个空元素
  if (!append || !stack[stack.length - 1]) {
    stack.pop()
  }

  // resolve relative path // 处理相对路径  ../ ./
  const segments = relative.replace(/^\//, '').split('/') // 新的path去掉开头的/并以/分割，取出每段的path
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === '..') { // ../ 上一级目录
      stack.pop()
    } else if (segment !== '.') { // 不是../，也不是./，将当前段path添加到stack中
      stack.push(segment)
    }
    // segment是./ 当前目录，不需要对stack进行操作
  }

  // ensure leading slash
  if (stack[0] !== '') { // 确保下一步用/拼接后开头是/
    stack.unshift('')
  }

  return stack.join('/') // 用/拼接出最新的完整path，开头一定为/
}

export function parsePath (path: string): { // 解析path，提取path query hash
  path: string;
  query: string;
  hash: string;
} {
  let hash = ''
  let query = ''

  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex)
    path = path.slice(0, hashIndex)
  }

  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    query = path.slice(queryIndex + 1)
    path = path.slice(0, queryIndex)
  }

  return {
    path,
    query, // 起始已经去掉？
    hash // 起始为#
  }
}

export function cleanPath (path: string): string {
  return path.replace(/\/\//g, '/')
}
