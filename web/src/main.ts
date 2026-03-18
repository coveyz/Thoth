/*
 * @Author: coveyz zhangkairong123@qq.com
 * @Date: 2026-03-04 15:30:12
 * @LastEditors: coveyz zhangkairong123@qq.com
 * @LastEditTime: 2026-03-12 20:56:06
 * @FilePath: /Thoth/web/src/main.ts
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';

import '@/styles/base.scss';

const app = createApp(App)
app
  .use(createPinia())
  .use(router)
  .mount('#app');

