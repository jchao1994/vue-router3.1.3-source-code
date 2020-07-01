/* @flow */

import type Router from '../index'
import { assert } from './warn'
import { getStateKey, setStateKey } from './state-key'

const positionStore = Object.create(null)

export function setupScroll () {
  // Fix for #1585 for Firefox
  // Fix for #2195 Add optional third attribute to workaround a bug in safari https://bugs.webkit.org/show_bug.cgi?id=182678
  // Fix for #2774 Support for apps loaded from Windows file shares not mapped to network drives: replaced location.origin with
  // window.location.protocol + '//' + window.location.host
  // location.host contains the port and location.hostname doesn't
  const protocolAndPath = window.location.protocol + '//' + window.location.host // 协议 + 域名
  const absolutePath = window.location.href.replace(protocolAndPath, '') // path去除协议和域名
  window.history.replaceState({ key: getStateKey() }, '', absolutePath)
  window.addEventListener('popstate', e => {
    saveScrollPosition() // 保存pageXOffset和pageYOffset
    if (e.state && e.state.key) {
      setStateKey(e.state.key)
    }
  })
}

export function handleScroll (
  router: Router,
  to: Route,
  from: Route,
  isPop: boolean
) {
  if (!router.app) { // 没有vm实例，直接return
    return
  }

  const behavior = router.options.scrollBehavior // 取到滚动行为
  if (!behavior) { // 没有滚动行为，直接return
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    assert(typeof behavior === 'function', `scrollBehavior must be a function`)
  }

  // wait until re-render finishes before scrolling // 将滚动事件添加在vm.$nextTick中
  router.app.$nextTick(() => {
    const position = getScrollPosition() // 获取滚动位置
    const shouldScroll = behavior.call(
      router,
      to,
      from,
      isPop ? position : null
    )

    if (!shouldScroll) {
      return
    }

    if (typeof shouldScroll.then === 'function') { // Promise
      shouldScroll
        .then(shouldScroll => {
          scrollToPosition((shouldScroll: any), position) // 执行滚动
        })
        .catch(err => {
          if (process.env.NODE_ENV !== 'production') {
            assert(false, err.toString())
          }
        })
    } else {
      scrollToPosition(shouldScroll, position) // 执行滚动
    }
  })
}

export function saveScrollPosition () {
  const key = getStateKey()
  if (key) {
    positionStore[key] = {
      x: window.pageXOffset,
      y: window.pageYOffset
    }
  }
}

function getScrollPosition (): ?Object {
  const key = getStateKey()
  if (key) {
    return positionStore[key]
  }
}

function getElementPosition (el: Element, offset: Object): Object { // 获取el的位置
  const docEl: any = document.documentElement
  const docRect = docEl.getBoundingClientRect() // document  Element.getBoundingClientRect()方法返回元素的大小及其相对于视口的位置
  const elRect = el.getBoundingClientRect() // el
  return {
    x: elRect.left - docRect.left - offset.x,
    y: elRect.top - docRect.top - offset.y
  }
}

function isValidPosition (obj: Object): boolean {
  return isNumber(obj.x) || isNumber(obj.y)
}

function normalizePosition (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : window.pageXOffset,
    y: isNumber(obj.y) ? obj.y : window.pageYOffset
  }
}

function normalizeOffset (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : 0,
    y: isNumber(obj.y) ? obj.y : 0
  }
}

function isNumber (v: any): boolean {
  return typeof v === 'number'
}

const hashStartsWithNumberRE = /^#\d/

function scrollToPosition (shouldScroll, position) { // 执行滚动
  const isObject = typeof shouldScroll === 'object'
  if (isObject && typeof shouldScroll.selector === 'string') {
    // getElementById would still fail if the selector contains a more complicated query like #main[data-attr]
    // but at the same time, it doesn't make much sense to select an element with an id and an extra selector
    const el = hashStartsWithNumberRE.test(shouldScroll.selector) // $flow-disable-line
      ? document.getElementById(shouldScroll.selector.slice(1)) // $flow-disable-line
      : document.querySelector(shouldScroll.selector)

    if (el) {
      let offset =
        shouldScroll.offset && typeof shouldScroll.offset === 'object'
          ? shouldScroll.offset
          : {}
      offset = normalizeOffset(offset) // 处理offset位置
      position = getElementPosition(el, offset) // 获取el应该滚动到的位置
    } else if (isValidPosition(shouldScroll)) {
      position = normalizePosition(shouldScroll) // 处理shouldScroll
    }
  } else if (isObject && isValidPosition(shouldScroll)) {
    position = normalizePosition(shouldScroll)
  }

  if (position) { // 执行滚动
    window.scrollTo(position.x, position.y)
  }
}
