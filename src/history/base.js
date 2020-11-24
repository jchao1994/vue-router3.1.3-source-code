/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn, isError, isExtendedError } from '../util/warn'
import { START, isSameRoute } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'
import { NavigationDuplicated } from './errors'

export class History {
  router: Router
  base: string
  current: Route
  pending: ?Route
  cb: (r: Route) => void
  ready: boolean
  readyCbs: Array<Function>
  readyErrorCbs: Array<Function>
  errorCbs: Array<Function>

  // implemented by sub-classes
  +go: (n: number) => void
  +push: (loc: RawLocation) => void
  +replace: (loc: RawLocation) => void
  +ensureURL: (push?: boolean) => void
  +getCurrentLocation: () => string

  constructor (router: Router, base: ?string) {
    this.router = router
    this.base = normalizeBase(base) // 处理基路径并去掉协议、域名、端口号，保证起始有/并且末尾没有/
    // start with a route object that stands for "nowhere"
    this.current = START // 将初始状态的route对象设为当前route对象
    this.pending = null
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
  }

  listen (cb: Function) {
    this.cb = cb
  }

  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  transitionTo ( // 核心代码 // 生成新的route对象，对比新老route对象处理守卫钩子，更新this.current，处理传入的onComplete回调
    location: RawLocation, // 新的URL对应的 不带基路径的完整path + query部分 + 锚部分
    onComplete?: Function, // 执行滚动的回调函数
    onAbort?: Function
  ) {
    const route = this.router.match(location, this.current) // 对比新的location和当前的route对象，生成新的route对象
    this.confirmTransition(
      route,
      () => { // onComplete
        this.updateRoute(route) // 将this.current设为新的route对象，调用this.router.afterHooks中的回调函数
        // history模式下将滚动事件添加在vm.$nextTick中
        onComplete && onComplete(route)
        this.ensureURL() // 此时this.current已经是新的route对象了，调用子类的方法replace更新URL

        // fire ready cbs once
        if (!this.ready) { // 执行readyCbs中的回调函数
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      err => { // onAbort
        if (onAbort) {
          onAbort(err)
        }
        if (err && !this.ready) { // 执行readyErrorCbs中的回调函数
          this.ready = true
          this.readyErrorCbs.forEach(cb => {
            cb(err)
          })
        }
      }
    )
  }

  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) { // route是新的route对象 // 核心代码
    const current = this.current // 当前的route对象
    const abort = err => {
      // after merging https://github.com/vuejs/vue-router/pull/2771 we
      // When the user navigates through history through back/forward buttons
      // we do not want to throw the error. We only throw it if directly calling
      // push/replace. That's why it's not included in isError
      if (!isExtendedError(NavigationDuplicated, err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }
    if ( // 如果是同一个路由，就不去跳转
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      route.matched.length === current.matched.length
    ) {
      this.ensureURL() // 确保当前URL对应this.current.fullPath，如果不是，进行跳转
      return abort(new NavigationDuplicated(route))
    }

    const { updated, deactivated, activated } = resolveQueue( // 对比新老route对象的matched(父级record数组)，提取updated deactivated activated
      this.current.matched, // 当前route对象的父级record数组
      route.matched // 新的route对象的父级record数组
    )

    const queue: Array<?NavigationGuard> = [].concat( // 守卫队列数组
      // in-component leave guards
      extractLeaveGuards(deactivated), // 提取组件beforeRouteLeave守卫的回调(先子后父)
      // global before hooks
      this.router.beforeHooks, // 全局beforeEach守卫的回调
      // in-component update hooks
      extractUpdateHooks(updated), // 提取组件beforeRouteUpdate守卫的回调(先父后子)
      // in-config enter guards
      activated.map(m => m.beforeEnter), // 路由独享守卫beforeEnter
      // async components
      // 这里加载异步组件(懒加载组件)利用的是promise微任务
      // 所以到这里eventLoop单轮结束，找到下一个宏任务，也就是整个vue的初始化，开始App.vue的生命周期
      // 等到整个vue的初始化完成之后再到这里来执行微任务，也就是处理加载完成的异步组件
      // 异步组件加载完成后不是立马render，而且是先执行完剩下的导航守卫，更新this.current为最新的route
      // 更新完route对象的时候这里的逻辑结束，才触发render
      resolveAsyncComponents(activated) // 处理activated中的异步组件的funciton
    )

    this.pending = route // 新的route对象
    const iterator = (hook: NavigationGuard, next) => { // 执行hook守卫的函数  hook就是守卫对应的回调函数
      if (this.pending !== route) {
        return abort()
      }
      try {
        hook(route, current, (to: any) => { // 执行守卫的回调函数，三个参数分别对应用户传入的三个形参to from next，传入守卫回调的时候最后需要执行next()才能继续下一个守卫回调
          if (to === false || isError(to)) { // next(false) 中断
            // next(false) -> abort navigation, ensure current URL
            this.ensureURL(true) // 用push方法确保当前的URL正确(确保当前去基路径的完整path与this.current.fullPath相同)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect 重定向，重定向之后守卫队列queue后面的守卫回调不再执行
            abort()
            if (typeof to === 'object' && to.replace) { // 确认replace还是push
              this.replace(to)
            } else { 
              // to为object且to.replace为false
              // to为string
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            // 没有重定向，也就是用户传入的守卫回调中执行的next（与这里的next不同）方法没有参数，直接执行守卫队列queue中的下一个守卫回调
            // 用户传入的守卫回调中的形参next是这里的hook方法传入的第三个参数(to: any) => {...}
            // 这里的next是()=>{ step(index + 1) }  执行守卫队列queue中的下一个守卫回调
            next(to)
          }
        })
      } catch (e) {
        abort(e)
      }
    }

    runQueue(queue, iterator, () => { // 执行queue中的每个守卫回调，全部执行完毕，再执行传入的回调
      // 当queue中所有的守卫回调都执行完了，也就是所有异步组件都加载完成之后，会执行到这里
      const postEnterCbs = []
      const isValid = () => this.current === route
      // wait until async components are resolved before
      // extracting in-component enter guards
      const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid) // 提取组件守卫beforeRouteEnter  这里每一项都是routeEnterGuard函数
      const queue = enterGuards.concat(this.router.resolveHooks) // 组件守卫beforeRouteEnter 全局解析守卫beforeResolve
      runQueue(queue, iterator, () => { // 执行queue中的每个守卫回调，全部执行完毕，再执行传入的回调
        if (this.pending !== route) {
          return abort()
        }
        // 此时，7种守卫中的6种已经执行完毕，还剩下全局后置钩子afterEach
        this.pending = null
        onComplete(route) // 调用onComplete回调  此时会执行全局后置钩子afterEach，至此7种守卫钩子都已经执行完毕  this.current变为新的route对象，这里的逻辑结束，触发组件更新
        if (this.router.app) {
          this.router.app.$nextTick(() => { // 将postEnterCbs(对应的是beforeRouteEnter中next(cb)中的回调函数cb)放在nextTick（组件统一更新的时候）中，执行时机在组件mounted周期之后
            postEnterCbs.forEach(cb => {
              cb() // poll(cb, match.instances, key, isValid)，也就是执行cb(instances[key])
            })
          })
        }
      })
    })
  }

  updateRoute (route: Route) { // 更新this.current为最新的route对象，执行this.cb回调和全局后置钩子afterEach
    const prev = this.current
    this.current = route
    this.cb && this.cb(route) // router.apps中的每个vm实例的_route指向新的route对象
    this.router.afterHooks.forEach(hook => {
      hook && hook(route, prev)
    })
  }
}

function normalizeBase (base: ?string): string { // 去掉协议、域名、端口号，保证起始有/并且末尾没有/
  if (!base) { // 如果没有base，就去找base标签的href作为base基路径，没有base标签的话基路径就为/
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '') // https://aaa.bbb.ccc:xxx/ddd/eee => /ddd/eee 去掉协议、域名、端口号
    } else {
      base = '/'
    }
  }
  // make sure there's the starting slash // 确保有起始斜线/
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash // 去除末尾斜线/
  return base.replace(/\/$/, '')
}

function resolveQueue ( // 对比新老route对象的matched(父级record数组)，提取updated activated deactivated
  current: Array<RouteRecord>, // 老的record数组
  next: Array<RouteRecord> // 新的record数组
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) { // 找到新老record数组中第一个不相同的索引
      break
    }
  }
  return {
    updated: next.slice(0, i), // 相同的部分，也就是需要更新的部分
    activated: next.slice(i), // 新的record数组中不相同的部分，也就是需要添加的部分
    deactivated: current.slice(i) // 老的record数组中不相同的部分，也就是需要移除的部分
  }
}

function extractGuards ( // 提取守卫的回调
  records: Array<RouteRecord>, // 需要提取的records数组
  name: string, // 组件守卫的名字beforeRouteLeave beforeRouteUpdate beforeRouteEnter
  bind: Function,
  reverse?: boolean // 是否需要反转
): Array<?Function> {
  const guards = flatMapComponents(records, (def, instance, match, key) => { // 结果是一维数组，每一项是records中的每个match的components中的每一项去执行fn的返回值
    const guard = extractGuard(def, name) // 取到name守卫对应的回调
    if (guard) {
      return Array.isArray(guard) // 将guard的this绑定为vm
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  return flatten(reverse ? guards.reverse() : guards) // 处理reverse并且降维成一维数组
}

function extractGuard (
  def: Object | Function, // component
  key: string // 组件守卫的名字beforeRouteLeave beforeRouteUpdate
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') { // def是组件选项，将其通过Vue.extend变成组件构造器
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  // def已经是组件构造器，取到key守卫对应的回调，这里是组件内的守卫
  return def.options[key]
}

function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true) // reverse = true 让子路由的回调放在最前面，也就是beforeRouteLeave先子后父
}

function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments) // guard回调绑定this为vm
    }
  }
}

function extractEnterGuards (
  activated: Array<RouteRecord>,
  cbs: Array<Function>,
  isValid: () => boolean
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => { // guard vm record name
      return bindEnterGuard(guard, match, key, cbs, isValid)
    }
  )
}

function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string, // component的name
  cbs: Array<Function>, // postEnterCbs
  isValid: () => boolean
): NavigationGuard {
  return function routeEnterGuard (to, from, next) { // next是hook传入的第三个参数(to:any)=>{...}
    return guard(to, from, cb => { // guard是用户传入的beforeRouteEnter守卫回调，如果用户执行next(xxx)，这里的cb就是xxx  beforeRouteEnter是支持给next传递回调的唯一守卫
      if (typeof cb === 'function') { // beforeRouteEnter不能获取组件实例this，但是可以通过传一个回调给next来访问组件实例  next(vm => {...})  cb就是vm => {...}
        cbs.push(() => {
          // #750
          // if a router-view is wrapped with an out-in transition,
          // the instance may not have been registered at this time.
          // we will need to poll for registration until current route
          // is no longer valid.
          poll(cb, match.instances, key, isValid)
        })
      }
      // 如果cb是string或者object，会进行重定向  如next('/') or next({ path: '/' })
      // 如果cb为undefined或者function，会继续执行守卫队列queue中的下一个守卫回调  如next() next(vm => {...})
      next(cb)
    })
  }
}

function poll (
  cb: any, // somehow flow cannot infer this is a function
  instances: Object,
  key: string, // component的name
  isValid: () => boolean // () => this.current === route
) {
  if (
    instances[key] &&
    !instances[key]._isBeingDestroyed // do not reuse being destroyed instance
  ) {
    cb(instances[key]) // 组件实例已经创建好，执行回调
  } else if (isValid()) { // 如果this.current === route且组件实例还没创建，则将poll(cb, instances, key, isValid)延迟16ms推入setTimeout队列
    setTimeout(() => {
      poll(cb, instances, key, isValid)
    }, 16)
  }
}
