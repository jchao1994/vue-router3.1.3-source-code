/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { START } from '../util/route'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

export class HTML5History extends History { // 继承History类  监听window.popstate this.push this.replace这三种情况下会触发this.transitionTo
  constructor (router: Router, base: ?string) {
    super(router, base) // 调用基类构造器

    // 滚动行为，用户传入的scrollBehavior
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    if (supportsScroll) {
      setupScroll() // 监听popstate事件，记录pageXOffset和pageYOffset
    }

    const initLocation = getLocation(this.base) // 不带基路径的完整path + query部分 + 锚部分

    // 监听popstate事件
    // 调用history.pushState()或history.replaceState()不会触发popstate事件
    // 只有在做出浏览器动作时，才会触发该事件，如用户点击浏览器的回退按钮（或者在Javascript代码中调用history.back()或者history.forward()方法）
    window.addEventListener('popstate', e => {
      const current = this.current // 当前的route对象

      // Avoiding first `popstate` event dispatched in some browsers but first
      // history route not updated since async guard at the same time.
      const location = getLocation(this.base) // 获取当前的location，也就是新跳转的URL对应的location  不带基路径的完整path + query部分 + 锚部分
      if (this.current === START && location === initLocation) { // 跳转相同的URL，直接返回
        return
      }
      
      // location !== initLocation
      this.transitionTo(location, route => {
        if (supportsScroll) {
          handleScroll(router, route, current, true) // 将滚动事件添加在vm.$nextTick中
        }
      })
    })
  }

  go (n: number) {
    window.history.go(n)
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this // fromRoute指向当前的route对象
    this.transitionTo(location, route => { // 第二个参数就是完成transitionTo之后的回调函数
      pushState(cleanPath(this.base + route.fullPath)) // window.location.assign更新URL
      handleScroll(this.router, route, fromRoute, false) // 执行滚动行为
      onComplete && onComplete(route) // 执行onComplete回调
    }, onAbort)
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this // fromRoute指向当前的route对象
    this.transitionTo(location, route => {
      replaceState(cleanPath(this.base + route.fullPath)) // window.location.replace更新URL
      handleScroll(this.router, route, fromRoute, false) // 执行滚动行为
      onComplete && onComplete(route) // 执行onComplete回调
    }, onAbort)
  }

  ensureURL (push?: boolean) {
    if (getLocation(this.base) !== this.current.fullPath) { // 当前去基路径的完整path与this.current.fullPath不相同，跳转 基路径+this.current.fullPath
      const current = cleanPath(this.base + this.current.fullPath) // 当前的基路径 + 完整path
      push ? pushState(current) : replaceState(current)
    }
  }

  getCurrentLocation (): string {
    return getLocation(this.base) // window.location.pathname去掉base段 + window.location.search + window.location.hash
  }
}

export function getLocation (base: string): string { // 不带基路径的完整path + query部分 + 锚部分
  let path = decodeURI(window.location.pathname) // 完整path /a/b/c
  if (base && path.indexOf(base) === 0) { // 如果path中有基路径base，就去掉base段  如/a为基路径 => /b/c
    path = path.slice(base.length)
  }
  return (path || '/') + window.location.search + window.location.hash // 不带基路径的完整path + query部分 + 锚部分
}
