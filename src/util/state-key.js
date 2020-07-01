/* @flow */
import { inBrowser } from './dom'

// use User Timing api (if present) for more accurate key precision
const Time =
  inBrowser && window.performance && window.performance.now
    ? window.performance
    : Date

export function genStateKey (): string { // 取window.performance.now或Date.now并保留三位小数作为stateKey
  return Time.now().toFixed(3)
}

let _key: string = genStateKey()

export function getStateKey () {
  return _key
}

export function setStateKey (key: string) {
  return (_key = key)
}
