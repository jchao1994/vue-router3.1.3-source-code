/* @flow */

import { inBrowser } from './dom'
import { saveScrollPosition } from './scroll'
import { genStateKey, setStateKey, getStateKey } from './state-key'
import { extend } from './misc'

export const supportsPushState = // 浏览器是否支持pushState方法(window.history)
  inBrowser &&
  (function () {
    const ua = window.navigator.userAgent

    if (
      (ua.indexOf('Android 2.') !== -1 || ua.indexOf('Android 4.0') !== -1) &&
      ua.indexOf('Mobile Safari') !== -1 &&
      ua.indexOf('Chrome') === -1 &&
      ua.indexOf('Windows Phone') === -1
    ) {
      return false
    }

    return window.history && 'pushState' in window.history
  })()

export function pushState (url?: string, replace?: boolean) {
  saveScrollPosition() // 跳转之前，保存位置，用于跳转之后滚动到原位置
  // try...catch the pushState call to get around Safari
  // DOM Exception 18 where it limits to 100 pushState calls
  const history = window.history
  try {
    if (replace) { // window.history.replaceState
      // preserve existing history state as it could be overriden by the user
      const stateCopy = extend({}, history.state)
      stateCopy.key = getStateKey() // 取当前的_key，replace不需要重新生成_key
      history.replaceState(stateCopy, '', url)
    } else { // window.history.pushState  push需要重新生成_key
      history.pushState({ key: setStateKey(genStateKey()) }, '', url) // 取window.performance.now或Date.now并保留三位小数作为stateKey并存放在_key中
    }
  } catch (e) { // 不支持以上方法，用window.location.replace/assign
    window.location[replace ? 'replace' : 'assign'](url)
  }
}

export function replaceState (url?: string) {
  pushState(url, true)
}
