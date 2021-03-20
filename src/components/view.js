import { warn } from '../util/warn'
import { extend } from '../util/misc'

export default {
  name: 'RouterView',
  functional: true,
  props: {
    name: { // 命名视图  route.components
      type: String,
      default: 'default'
    }
  },
  render (_, { props, children, parent, data }) {
    // used by devtools to display a router-view badge
    data.routerView = true

    // directly use parent context's createElement() function
    // so that components rendered by router-view can resolve named slots
    const h = parent.$createElement
    const name = props.name
    const route = parent.$route
    const cache = parent._routerViewCache || (parent._routerViewCache = {}) // 获取父组件的_routerViewCache属性，如果没有则初始化为空对象

    // determine current view depth, also check to see if the tree
    // has been toggled inactive but kept-alive.
    let depth = 0 // 组件嵌套的层次
    let inactive = false // 是否在keep-alive组件内
    while (parent && parent._routerRoot !== parent) { // 遍历父节点，找到顶级节点
      const vnodeData = parent.$vnode ? parent.$vnode.data : {} // 外壳节点的data？？？
      if (vnodeData.routerView) {
        depth++
      }
      // 第一次正常渲染之后，vnodeData.keepAlive才会为true
      // 也就是inactive为true，表示第二次渲染
      if (vnodeData.keepAlive && parent._directInactive && parent._inactive) {
        inactive = true
      }
      parent = parent.$parent // 父节点，不是外壳节点
    }
    data.routerViewDepth = depth

    // render previous view if the tree is inactive and kept-alive
    // 处理keep-alive，直接渲染，第二次渲染才会走这个逻辑，第一次渲染为正常渲染
    // 如果缓存丢失，直接渲染空的vnode
    if (inactive) {
      const cachedData = cache[name]
      const cachedComponent = cachedData && cachedData.component
      if (cachedComponent) {
        // #2301
        // pass props
        if (cachedData.configProps) {
          fillPropsinData(cachedComponent, data, cachedData.route, cachedData.configProps) // 将cachedData.configProps中的prop添加到data.attrs中
        }
        return h(cachedComponent, data, children)
      } else {
        // render previous empty view
        return h()
      }
    }

    // 处理非keep-alive
    const matched = route.matched[depth] // 获取当前深度depth对应的record对象(也就是自己的record对象)
    const component = matched && matched.components[name] // matched.components中对应name的component

    // render empty node if no matched route or no config component
    if (!matched || !component) { // 没有matched或者没有component，生成空的vnode
      cache[name] = null
      return h()
    }

    // cache component
    cache[name] = { component } // 缓存component

    // attach instance registration hook
    // this will be called in the instance's injected lifecycle hooks
    data.registerRouteInstance = (vm, val) => { // 注册实例  在当前record对象的instances中注册这个router-view实例  vm和val都是vm
      // val could be undefined for unregistration
      const current = matched.instances[name]
      if (
        (val && current !== vm) || // 传入val，注册
        (!val && current === vm) // 不传val，销毁
      ) {
        matched.instances[name] = val
      }
    }

    // also register instance in prepatch hook
    // in case the same component instance is reused across different routes
    ;(data.hook || (data.hook = {})).prepatch = (_, vnode) => { // 在prepatch中注册实例，作用？？？
      matched.instances[name] = vnode.componentInstance
    }

    // register instance in init hook
    // in case kept-alive component be actived when routes changed
    data.hook.init = (vnode) => { // 在init中注册实例，处理keep-alive，作用？？？
      if (vnode.data.keepAlive &&
        vnode.componentInstance &&
        vnode.componentInstance !== matched.instances[name]
      ) {
        matched.instances[name] = vnode.componentInstance
      }
    }

    const configProps = matched.props && matched.props[name]
    // save route and configProps in cachce // 缓存route对象和configProps
    if (configProps) {
      extend(cache[name], {
        route,
        configProps
      })
      fillPropsinData(component, data, route, configProps) // 将configProps中的prop添加到data.attrs中
    }

    return h(component, data, children) // 创建vnode
  }
}

function fillPropsinData (component, data, route, configProps) {
  // resolve props // 处理props
  let propsToPass = data.props = resolveProps(route, configProps)
  if (propsToPass) {
    // clone to prevent mutation // 浅拷贝
    propsToPass = data.props = extend({}, propsToPass)
    // pass non-declared props as attrs
    const attrs = data.attrs = data.attrs || {}
    for (const key in propsToPass) { // data.attrs中添加component.props中没有的configProps
      if (!component.props || !(key in component.props)) {
        attrs[key] = propsToPass[key]
        delete propsToPass[key]
      }
    }
  }
}

function resolveProps (route, config) {
  switch (typeof config) {
    case 'undefined':
      return
    case 'object':
      return config
    case 'function':
      return config(route)
    case 'boolean':
      return config ? route.params : undefined
    default:
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false,
          `props in "${route.path}" is a ${typeof config}, ` +
          `expecting an object, function or boolean.`
        )
      }
  }
}
