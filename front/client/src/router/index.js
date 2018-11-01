import Vue from 'vue';
import Router from 'vue-router';
import Home from '@/components/Home';
import Payload from '@/components/deflate/Payload';

Vue.use(Router);

export default new Router({
  mode: 'history',
  routes: [
    {
      path: '/',
      name: 'Home',
      component: Home,
    },
    {
      path: '/deflate',
      name: 'DEFLATE Decompression',
      component: Payload,
    },
  ],
});
