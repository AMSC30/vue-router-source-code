import Vue from 'vue'
import VueRouter from 'vue-router'

Vue.use(VueRouter)

const Parent = {
  template: `
    <div class="parent">
      <h2>Parent</h2>
      <router-view class="child"></router-view>
    </div>
  `
}

const Default = { template: '<div>default</div>' }
const Foo = { template: '<div>foo</div>' }
const Bar = { template: '<div>bar</div>' }
const Baz = { template: '<div>baz</div>' }

const Qux = {
  template: `
    <div class="nested-parent">
      <h3>qux</h3>
      <router-link :to="{ name: 'quux' }">/quux</router-link>
      <router-view class="nested-child"></router-view>
    </div>
  `
}
const Quy = {
  template: `
    <div class="nested-parent-other">
      <h3>quy</h3>
      <pre>{{ JSON.stringify(Object.keys($route.params)) }}</pre>
    </div>
  `
}
const Quux = {
  template: `<div>quux<router-link :to="{ name: 'quuy' }">go to quuy</router-link></div>`
}
const Quuy = { template: '<div>quuy</div>' }
const Zap = {
  template: '<div><h3>zap</h3><pre>{{ $route.params.zapId }}</pre></div>'
}

const router = new VueRouter({
  mode: 'history',
  base: __dirname,
  routes: [
    { path: '', redirect: '/' },
    { path: '/', redirect: '/parent' },
    {
      path: '/parent',
      alias: ['/app', '/ass'],
      component: Parent,
      children: [
        { path: '', component: Default },
        { path: 'foo', component: Foo },
        { path: 'bar', component: Bar },
        { path: '/baz', component: Baz },
        {
          path: 'qux/:quxId',
          component: Qux,
          children: [
            { path: 'quux', name: 'quux', component: Quux },
            { path: 'quuy', name: 'quuy', component: Quuy }
          ]
        },
        { path: 'quy/:quyId', component: Quy },
        { name: 'zap', path: 'zap/:zapId?', component: Zap }
      ]
    }
  ]
})

new Vue({
  router,
  template: `
    <div id="app">
      <h1>Nested Routes</h1>
      <ul>
        <li><router-link to="/parent">/parent</router-link></li>
        <li><router-link to="/parent/foo">/parent/foo</router-link></li>
        <li><router-link to="/parent/bar">/parent/bar</router-link></li>
        <li><router-link to="/baz">/baz</router-link></li>
        <li><router-link to="/parent/qux/123">/parent/qux</router-link></li>
        <li><router-link to="/parent/quy/123">/parent/quy</router-link></li>
        <li><router-link :to="{name: 'zap'}">/parent/zap</router-link></li>
        <li><router-link :to="{name: 'zap', params: {zapId: 1}}">/parent/zap/1</router-link></li>
        <li><router-link :to="{ params: { zapId: 2 }}">{ params: { zapId: 2 }} (relative params)</router-link></li>
        <li><router-link to="/parent/qux/1/quux">/parent/qux/1/quux</router-link></li>
        <li><router-link to="/parent/qux/2/quux">/parent/qux/2/quux</router-link></li>
      </ul>
      <router-view class="view"></router-view>
    </div>
  `
}).$mount('#app')
