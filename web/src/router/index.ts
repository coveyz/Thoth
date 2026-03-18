/*
 * @Author: coveyz zhangkairong123@qq.com
 * @Date: 2026-03-04 15:30:12
 * @LastEditors: coveyz zhangkairong123@qq.com
 * @LastEditTime: 2026-03-17 20:25:45
 * @FilePath: /Thoth/web/src/router/index.ts
 */

import { createRouter, createWebHistory } from 'vue-router';
import type { Router } from 'vue-router';

export const constantRoutes = [
  { path: '/', redirect: '/chat' },
  { path: '/chat', component: () => import('@/pages/ChatPage/index.vue') },
  { path: '/setting', component: () => import('@/pages/SettingsPage/index.vue') },
];

const routerFactory = (): Router => createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: constantRoutes
})

const router: Router = routerFactory();

export default router;
