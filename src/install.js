import View from './components/view'
import Link from './components/link'

export let _Vue

// 1.安装vue-router插件 Vue.use(VueRouter)
export function install (Vue) {
  if (install.installed && _Vue === Vue) return // 防止重复安装
  install.installed = true

  _Vue = Vue

  const isDef = v => v !== undefined

  // 处理RouterView组件中的registerRouteInstance
  const registerInstance = (vm, callVal) => { // 传入callVal，注册实例  不传callVal，销毁实例
    let i = vm.$options._parentVnode // 外壳节点
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) { // vm.$options._parentVnode.data.registerRouteInstance
      i(vm, callVal)
    }
  }

  Vue.mixin({ // 混入beforeCreate destroyed  3.Vue.mixin(mixin)之后创建的每个组件实例都会执行混入的beforeCreate
    beforeCreate () { // this指向vm实例
      if (isDef(this.$options.router)) { // 用户传入router实例  new Vue({ router })
        this._routerRoot = this // vm._routerRoot指向vm实例
        this._router = this.$options.router // 传入的router实例 vm._router指向router实例
        this._router.init(this) // 传入的router调用init方法
        Vue.util.defineReactive(this, '_route', this._router.history.current) // vm._route设定为vm._router.history.current(当前的route对象)，同时设置响应式  _route改变，就会更新组件
      } else { // 用户没有传入router  非Vue实例  这样就可以保证每个vm的this._routerRoot._router都指向唯一的VueRouter实例
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      //  src/components/view.js
      registerInstance(this, this) // 注册实例  route.matched[depth].instances[name] = this 也就是 record.instances[name] = this
    },
    destroyed () {
      registerInstance(this) // 销毁实例  route.matched[depth].instances[name] = undefined
    }
  })

  Object.defineProperty(Vue.prototype, '$router', { // vm.$router指向用户传入的router实例，通过Object.defineProperty可以使其只读，不可修改
    get () { return this._routerRoot._router }
  })

  Object.defineProperty(Vue.prototype, '$route', { // vm.$route指向vm._routerRoot._route对象(当前的route对象)，通过Object.defineProperty可以使其只读，不可修改
    get () { return this._routerRoot._route }
  })

  Vue.component('RouterView', View) // 注册全局组件RouterView
  Vue.component('RouterLink', Link) // 注册全局组件RouterLink

  // 定义合并策略？？？
  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
