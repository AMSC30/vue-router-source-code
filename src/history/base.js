/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn } from '../util/warn'
import { START, handleRouteEntered } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'
import {
  createNavigationCancelledError,
  createNavigationRedirectedError,
  createNavigationAbortedError,
  isError,
  isNavigationFailure,
  NavigationFailureType
} from '../util/errors'

export class History {
  constructor(router: Router, base: ?string) {
    this.router = router
    this.base = normalizeBase(base)
    this.current = START

    this.pending = null
    this.ready = false

    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
    this.listeners = []
  }

  listen(cb: Function) {
    this.cb = cb
  }

  onReady(cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  onError(errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  transitionTo(
    location: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) {
    let route
    try {
      route = this.router.match(location, this.current)
    } catch (e) {
      this.errorCbs.forEach(cb => {
        cb(e)
      })
      throw e
    }
    const prev = this.current
    this.confirmTransition(
      route,
      () => {
        // 改变_route
        this.updateRoute(route)
        onComplete && onComplete(route)
        // 改变url,导航成功后才改变url
        this.ensureURL()
        // 执行afterEach注册的钩子
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })

        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      err => {
        if (onAbort) {
          onAbort(err)
        }
        if (err && !this.ready) {
          if (
            !isNavigationFailure(err, NavigationFailureType.redirected) ||
            prev !== START
          ) {
            this.ready = true
            this.readyErrorCbs.forEach(cb => {
              cb(err)
            })
          }
        }
      }
    )
  }

  confirmTransition(route: Route, onComplete: Function, onAbort?: Function) {
    const current = this.current
    this.pending = route
    const abort = err => {
      if (!isNavigationFailure(err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else {
          if (process.env.NODE_ENV !== 'production') {
            warn(false, 'uncaught error during route navigation:')
          }
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }

    // 均为record数组
    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )

    const queue: Array<?NavigationGuard> = [].concat(
      // beforeRouteLeave回调,从子到父
      extractLeaveGuards(deactivated),

      // beforeEach回调,按注册顺序调用
      this.router.beforeHooks,

      // beforeRouteUpdate回调,从父到子
      extractUpdateHooks(updated),

      // beforeEnter回调,注册在路由配置中
      activated.map(m => m.beforeEnter),

      // 异步组件
      resolveAsyncComponents(activated)
    )
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        hook(route, current, (to: any) => {
          if (to === false) {
            this.ensureURL(true)
            abort(createNavigationAbortedError(current, route))
          } else if (isError(to)) {
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort(createNavigationRedirectedError(current, route))
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            next(to)
          }
        })
      } catch (e) {
        abort(e)
      }
    }

    runQueue(queue, iterator, () => {
      // beforeRouteEnter生命周期
      const enterGuards = extractEnterGuards(activated)
      // beforeResolve钩子
      const queue = enterGuards.concat(this.router.resolveHooks)
      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort(createNavigationCancelledError(current, route))
        }
        this.pending = null
        onComplete(route)
        if (this.router.app) {
          this.router.app.$nextTick(() => {
            handleRouteEntered(route)
          })
        }
      })
    })
  }

  updateRoute(route: Route) {
    this.current = route
    this.cb && this.cb(route)
  }

  setupListeners() {
    // Default implementation is empty
  }

  teardown() {
    this.listeners.forEach(cleanupListener => {
      cleanupListener()
    })
    this.listeners = []

    this.current = START
    this.pending = null
  }
}

function normalizeBase(base: ?string): string {
  // 如果没有base，根据base标签的href属性，如果没有base标签默认为'/'
  // 优先级: options.base -> base tag -> default
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }

  // 主动给base加上/ ，所以配置的时候，可写可不写
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // 删除末尾的slash，所有可写可不写
  return base.replace(/\/$/, '')
}

function resolveQueue(current: Array<RouteRecord>, next: Array<RouteRecord>) {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}

function extractGuards(
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    // 获取到路由的导航守卫,可能是个函数数组
    const guard = extractGuard(def, name)
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  return flatten(reverse ? guards.reverse() : guards)
}

function extractGuard(
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    def = _Vue.extend(def)
  }
  return def.options[key]
}

function extractLeaveGuards(deactivated: Array<RouteRecord>): Array<?Function> {
  // 子组件的beforeRouteLeave先执行
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

function extractUpdateHooks(updated: Array<RouteRecord>): Array<?Function> {
  // update从父到子
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

function bindGuard(guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard() {
      return guard.apply(instance, arguments)
    }
  }
}

function extractEnterGuards(activated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key)
    }
  )
}

function bindEnterGuard(
  guard: NavigationGuard,
  match: RouteRecord,
  key: string
): NavigationGuard {
  return function routeEnterGuard(to, from, next) {
    return guard(to, from, cb => {
      if (typeof cb === 'function') {
        if (!match.enteredCbs[key]) {
          match.enteredCbs[key] = []
        }
        match.enteredCbs[key].push(cb)
      }
      next(cb)
    })
  }
}
