/* @flow */

import { createRoute, isSameRoute, isIncludedRoute } from '../util/route'
import { extend } from '../util/misc'
import { normalizeLocation } from '../util/location'
import { warn } from '../util/warn'

// work around weird flow bug
const toTypes: Array<Function> = [String, Object]
const eventTypes: Array<Function> = [String, Array]

const noop = () => {}

export default {
  name: 'RouterLink',
  props: {
    to: { // 点击之后，通过router.push(to)进行跳转
      type: toTypes, // [String, Object]
      required: true
    },
    tag: { // router-link组件渲染的标签名，默认是a标签
      type: String,
      default: 'a'
    },
    exact: Boolean, // “是否激活”默认类名的依据是包含匹配
    append: Boolean, // 设置append属性后,则在当前(相对)路径前添加基路径
    replace: Boolean, // 设置replace后，当点击时会调用router.replace()而不是router.push(),这样导航后不会留下history记录
    activeClass: String, // 链接激活时使用的CSS类名
    exactActiveClass: String, // 配置当链接被精确匹配的时候应该激活的 class
    event: { // 声明可以用来触发导航的事件。可以是一个字符串或是一个包含字符串的数组，默认是click事件
      type: eventTypes, // [String, Array]
      default: 'click'
    }
  },
  // render: h => {
  //   todo... // 调用h()，也就是vm.$createElement
  //   h()
  // }
  render (h: Function) {
    const router = this.$router
    const current = this.$route
    const { location, route, href } = router.resolve( // 新的location对象 新的route对象 新的href(包含base path query hash)
      this.to,
      current,
      this.append
    )

    const classes = {}
    const globalActiveClass = router.options.linkActiveClass // 全局配置 <router-link> 默认的激活的 class
    const globalExactActiveClass = router.options.linkExactActiveClass // 全局配置 <router-link> 默认的精确激活的 class
    // Support global empty active class
    const activeClassFallback = // 默认值router-link-active
      globalActiveClass == null ? 'router-link-active' : globalActiveClass
    const exactActiveClassFallback = // 默认值router-link-exact-active
      globalExactActiveClass == null
        ? 'router-link-exact-active'
        : globalExactActiveClass
    // 优先<router-link>标签传入的activeClass和exactActiveClass，没有才用new VueRouter()时传入的options中的linkActiveClass和linkExactActiveClass
    const activeClass = // 优先this.activeClass
      this.activeClass == null ? activeClassFallback : this.activeClass
    const exactActiveClass = // 优先this.exactActiveClass
      this.exactActiveClass == null
        ? exactActiveClassFallback
        : this.exactActiveClass

    const compareTarget = route.redirectedFrom // 是否需要重定向，创建新的route对象
      ? createRoute(null, normalizeLocation(route.redirectedFrom), null, router)
      : route

    classes[exactActiveClass] = isSameRoute(current, compareTarget) // current和compareTarget相同，精确匹配的class生效
    classes[activeClass] = this.exact // 开启精确匹配，就与exactActiveClass同时生效，否则根据current是否包含compareTarget进行模糊匹配
      ? classes[exactActiveClass] // current和compareTarget是否相同
      : isIncludedRoute(current, compareTarget) // current是否包含compareTarget

    const handler = e => { // e是event对象
      if (guardEvent(e)) { // 是否为路由事件
        if (this.replace) { // 切换路由
          router.replace(location, noop)
        } else {
          router.push(location, noop)
        }
      }
    }

    // 处理<router-link>组件的event事件，默认有click事件
    // <router-link>组件传入的event事件中没有click事件，那么最后生成的dom元素的click事件无法实现跳转路由，除非tag不是a，且能找到a标签，且a标签没有click事件
    // event不传入事件，或者传入的事件包括click，最后的dom元素的click事件才能实现跳转路由
    const on = { click: guardEvent }
    if (Array.isArray(this.event)) {
      this.event.forEach(e => {
        on[e] = handler
      })
    } else {
      on[this.event] = handler
    }

    const data: any = { class: classes }

    // 处理作用域插槽
    const scopedSlot =
      !this.$scopedSlots.$hasNormal &&
      this.$scopedSlots.default &&
      this.$scopedSlots.default({
        href,
        route,
        navigate: handler,
        isActive: classes[activeClass],
        isExactActive: classes[exactActiveClass]
      })

    if (scopedSlot) {
      if (scopedSlot.length === 1) {
        return scopedSlot[0]
      } else if (scopedSlot.length > 1 || !scopedSlot.length) {
        if (process.env.NODE_ENV !== 'production') {
          warn(
            false,
            `RouterLink with to="${
              this.to
            }" is trying to use a scoped slot but it didn't provide exactly one child. Wrapping the content with a span element.`
          )
        }
        return scopedSlot.length === 0 ? h() : h('span', {}, scopedSlot)
      }
    }

    if (this.tag === 'a') { // a标签
      data.on = on
      data.attrs = { href }
    } else { // 其他标签
      // find the first <a> child and apply listener and href
      const a = findAnchor(this.$slots.default) // 查找第一个a标签
      if (a) {
        // <router-link>里面有a标签，把传入的事件添加到找到的a标签上(保留a标签上原有的事件)，将a标签的href设为处理完的新的href
        // 如果a标签中有click事件且<router-link>传入了event事件(不包含click)，那么最后的dom元素a标签的click事件无法实现路由跳转
        // in case the <a> is a static node
        a.isStatic = false
        const aData = (a.data = extend({}, a.data))
        aData.on = aData.on || {} // a.data.on
        // transform existing events in both objects into arrays so we can push later
        for (const event in aData.on) {
          const handler = aData.on[event]
          if (event in on) { // 如果event在<router-link>标签传入的事件中，将a.data.on[event]转为数组形式
            aData.on[event] = Array.isArray(handler) ? handler : [handler]
          }
        }
        // append new listeners for router-link // a.data.on中添加<router-link>标签传入的事件
        for (const event in on) {
          if (event in aData.on) {
            // on[event] is always a function
            aData.on[event].push(on[event])
          } else {
            aData.on[event] = handler
          }
        }

        const aAttrs = (a.data.attrs = extend({}, a.data.attrs))
        aAttrs.href = href
      } else { // <router-link>里面没有a标签，把传入的事件添加到当前标签上
        // doesn't have <a> child, apply listener to self
        data.on = on
      }
    }

    return h(this.tag, data, this.$slots.default)
  }
}

function guardEvent (e) {
  // don't redirect with control keys
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return // 按下meta ALT CTRL SHIFT
  // don't redirect when preventDefault called
  if (e.defaultPrevented) return // 是否调用event.preventDefault() 默认行为已被取消
  // don't redirect on right click
  // e.button返回当事件被触发时，哪个鼠标按钮被点击
  // 0 为 左键点击
  // 1 为 中键点击
  // 2 为 右键点击
  if (e.button !== undefined && e.button !== 0) return // 中键和右键 return  只允许左键
  // don't redirect if `target="_blank"`
  if (e.currentTarget && e.currentTarget.getAttribute) { // e.currentTarget的target属性为_blank
    const target = e.currentTarget.getAttribute('target')
    if (/\b_blank\b/i.test(target)) return // \b 匹配单词边界，连续的数字、字母或下划线组成的字符串会认为一个单词
  }
  // this may be a Weex event which doesn't have this method
  if (e.preventDefault) { // 阻止默认行为
    e.preventDefault()
  }
  return true
}

function findAnchor (children) { // 递归children寻找第一个a标签
  if (children) {
    let child
    for (let i = 0; i < children.length; i++) {
      child = children[i]
      if (child.tag === 'a') {
        return child
      }
      if (child.children && (child = findAnchor(child.children))) {
        return child
      }
    }
  }
}
