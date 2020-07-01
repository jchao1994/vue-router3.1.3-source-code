/* @flow */

export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) { // 守卫队列 执行守卫的函数iterator 最后的回调函数cb
  const step = index => {
    if (index >= queue.length) { // queue全部执行完毕，执行cb回调
      cb()
    } else {
      if (queue[index]) {
        fn(queue[index], () => { // 执行queue[index]对应的守卫回调函数 第二个参数是next方法
          step(index + 1) // 执行守卫队列中的下一个守卫回调
        })
      } else {
        step(index + 1)
      }
    }
  }
  step(0)
}
