/* @flow */

import { _Vue } from '../install'
import { warn, isError } from './warn'

export function resolveAsyncComponents (matched: Array<RouteRecord>): Function { // matched是activated对应的records数组
  return (to, from, next) => {
    let hasAsync = false
    let pending = 0
    let error = null

    flatMapComponents(matched, (def, _, match, key) => { // component vm record component的name
      // if it's a function and doesn't have cid attached,
      // assume it's an async component resolve function.
      // we are not using Vue's default async resolving mechanism because
      // we want to halt the navigation until the incoming component has been
      // resolved.
      if (typeof def === 'function' && def.cid === undefined) { // def是function，就表示是异步组件
        hasAsync = true
        pending++

        const resolve = once(resolvedDef => {
          if (isESModule(resolvedDef)) {
            resolvedDef = resolvedDef.default
          }
          // save resolved on async factory in case it's used elsewhere
          def.resolved = typeof resolvedDef === 'function' // 如果resolvedDef是异步工厂函数，就保留，如果不是，转换为组件构造器
            ? resolvedDef
            : _Vue.extend(resolvedDef)
          match.components[key] = resolvedDef // 更新match.components[key] = resolvedDef
          pending--
          if (pending <= 0) { // 全部加载完毕，直接next()
            next()
          }
        })

        const reject = once(reason => {
          const msg = `Failed to resolve async component ${key}: ${reason}`
          process.env.NODE_ENV !== 'production' && warn(false, msg)
          if (!error) {
            error = isError(reason)
              ? reason
              : new Error(msg)
            next(error)
          }
        })

        let res
        try {
          res = def(resolve, reject)
        } catch (e) {
          reject(e)
        }
        if (res) {
          if (typeof res.then === 'function') { // Promise  () => import('./my-async-component')这种语法返回的是Promise
            res.then(resolve, reject)
          } else {
            // new syntax in Vue 2.3
            const comp = res.component
            if (comp && typeof comp.then === 'function') { // () => ({ component: import('./MyComponent.vue'), loading: LoadingComponent, error: ErrorComponent, delay: 200, timeout: 3000 })这种语法返回一个对象
              comp.then(resolve, reject)
            }
          }
        }
      }
    })

    // 没有异步组件，就直接next
    if (!hasAsync) next()
  }
}

export function flatMapComponents (
  matched: Array<RouteRecord>, // 需要提取的records数组
  fn: Function
): Array<?Function> {
  // matched(records)中的每一项变成一个数组，这个数组中的每一项是 match.components中的每一项执行fn的返回值，最后对这个返回的数组进行降维处理
  // 最后的返回结果是一维数组，每一项是matched中的每个match的components中的每一项component去执行fn的返回值
  // fn的返回值是function，也可能是数组（其中每一项为function），这个function是绑定this到vm上的guard回调
  return flatten(matched.map(m => { // m指向每个record
    return Object.keys(m.components).map(key => fn( // 用户传入的route.components中的每一项执行fn方法  key是每个component的name
      m.components[key], // 用户传入的route.components中的每一个component  如果只传入单个route.component会在创建record对象的时候转为对象形式{ default: route.componen }
      m.instances[key], // 使用了router-view标签的组件中name为key的组件实例
      m, // record
      key // 每个component的name
    ))
  }))
}

export function flatten (arr: Array<any>): Array<any> { // 将arr数组降低一维
  return Array.prototype.concat.apply([], arr)
}

const hasSymbol =
  typeof Symbol === 'function' &&
  typeof Symbol.toStringTag === 'symbol'

function isESModule (obj) {
  return obj.__esModule || (hasSymbol && obj[Symbol.toStringTag] === 'Module')
}

// in Webpack 2, require.ensure now also returns a Promise
// so the resolve/reject functions may get called an extra time
// if the user uses an arrow function shorthand that happens to
// return that Promise.
function once (fn) { // fn只能执行一次
  let called = false
  return function (...args) {
    if (called) return
    called = true
    return fn.apply(this, args)
  }
}
