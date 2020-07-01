/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { getLocation } from './html5'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

// hash模式过程
// $router.push() --> HashHistory.push() --> History.transitionTo() --> History.updateRoute() --> {app._route = route} --> vm.render()
export class HashHistory extends History { // 继承History类
  constructor (router: Router, base: ?string, fallback: boolean) {
    super(router, base) // 调用基类构造器
    // check history fallback deeplinking
    if (fallback && checkFallback(this.base)) {
      return
    }
    ensureSlash() // 确保path去掉/#之后是以/开头的，如果不是，拼接上/后replace跳转
  }

  // this is delayed until the app mounts
  // to avoid the hashchange listener being fired too early
  setupListeners () {
    const router = this.router
    const expectScroll = router.options.scrollBehavior // 滚动行为，用户传入的scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    if (supportsScroll) {
      setupScroll() // 监听popstate事件，记录pageXOffset和pageYOffset
    }

    window.addEventListener(
      supportsPushState ? 'popstate' : 'hashchange',
      () => {
        const current = this.current
        if (!ensureSlash()) { // 确保hash带上斜杠，没有的话则加上
          return
        }
        // push replace会执行2遍this.transitionTo，第二遍的时候会在isSameRoute时中断？？？
        this.transitionTo(getHash(), route => {
          if (supportsScroll) {
            handleScroll(this.router, route, current, true) // 将滚动事件添加在vm.$nextTick中
          }
          if (!supportsPushState) {
            replaceHash(route.fullPath) // window.location.replace
          }
        })
      }
    )
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        pushHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        replaceHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  go (n: number) {
    window.history.go(n)
  }

  ensureURL (push?: boolean) {
    const current = this.current.fullPath
    if (getHash() !== current) {
      push ? pushHash(current) : replaceHash(current)
    }
  }

  getCurrentLocation () {
    return getHash()
  }
}

function checkFallback (base) {
  const location = getLocation(base) // window.location.pathname去掉base段 + window.location.search + window.location.hash
  if (!/^\/#/.test(location)) { // location不以/#开头，需要做降级处理，降级为hash模式下应有的/#开头，返回true
    window.location.replace(cleanPath(base + '/#' + location))
    return true
  }
}

function ensureSlash (): boolean {
  const path = getHash() // 截取path中#之后的字段(#后面的hash段)，并对锚点和query进行处理
  if (path.charAt(0) === '/') { // #/xxx
    return true
  }
  // path起始不为/，在开头拼接上/并用replace跳转  #xxx
  replaceHash('/' + path)
  return false
}

export function getHash (): string { // 截取path中#之后的字段，并对锚点和query进行处理
  // We can't use window.location.hash here because it's not
  // consistent across browsers - Firefox will pre-decode it!
  // 兼容Firefox浏览器，不能使用window.location.hash
  let href = window.location.href
  const index = href.indexOf('#')
  // empty path // 没有#，就表示是空path
  if (index < 0) return ''

  href = href.slice(index + 1) // 截取#之后的path
  // decode the hash but not the search or hash
  // as search(query) is already decoded
  // https://github.com/vuejs/vue-router/issues/2708
  const searchIndex = href.indexOf('?')
  if (searchIndex < 0) { // 没有?
    const hashIndex = href.indexOf('#') // window.location.href中有可能有两个#？？？
    if (hashIndex > -1) { // 还有#锚点 将path和锚分开处理  (#)xxx#xxx
      href = decodeURI(href.slice(0, hashIndex)) + href.slice(hashIndex)
    } else href = decodeURI(href) // (#)xxx
  } else { // 有? 将path和query分开处理  (#)xxx?xxx
    href = decodeURI(href.slice(0, searchIndex)) + href.slice(searchIndex)
  }

  return href
}

function getUrl (path) { // 结合window.location.href和path，生成一个新的带#标识的hash路由
  const href = window.location.href
  const i = href.indexOf('#')
  const base = i >= 0 ? href.slice(0, i) : href // 取到#之间的基路径，如果没有#，把整个href作为基路径
  return `${base}#${path}`
}

function pushHash (path) {
  if (supportsPushState) {
    pushState(getUrl(path))
  } else {
    // 添加锚#path，实现跳转  hash的改变会自动添加到浏览器的访问历史记录中
    // 如果window.location.hash === path，不会触发hashChange事件
    window.location.hash = path
  }
}

function replaceHash (path) {
  if (supportsPushState) {
    replaceState(getUrl(path))
  } else {
    window.location.replace(getUrl(path))
  }
}
