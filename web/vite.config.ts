/*
 * @Author: coveyz zhangkairong123@qq.com
 * @Date: 2026-03-04 15:30:12
 * @LastEditors: coveyz zhangkairong123@qq.com
 * @LastEditTime: 2026-03-12 21:39:29
 * @FilePath: /Thoth/web/vite.config.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { fileURLToPath, URL } from 'node:url'
import path from 'path';

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'


const resolve = (dir: string) => {
  return path.resolve(__dirname, dir);
};


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  // resolve: {
  //   alias: {
  //     "@": resolve("src")
  //   }
  // },
  server: {
    port: 5173,
    fs: {
      strict: false
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
