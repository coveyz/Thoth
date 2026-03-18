<!--
 * @Author: coveyz zhangkairong123@qq.com
 * @Date: 2026-03-12 20:53:40
 * @LastEditors: coveyz zhangkairong123@qq.com
 * @LastEditTime: 2026-03-17 20:23:52
 * @FilePath: /Thoth/web/src/layouts/index.vue
-->

<template>
  <div class="app">
    <header class="header">
      <div class="brand">
        <div class="title">Thoth</div>
        <div class="subTitle">week1 ChatMVP</div>
      </div>
      <nav class="nav">
        <router-link to="/chat" class="link">Chat</router-link>
        <router-link to="/setting" class="link">Setting</router-link>
      </nav>
    </header>

    <main class="main">
      <router-view />
    </main>
  </div>
</template>


<style scoped lang="scss">
.header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.brand {
  display: flex;
  flex-direction: column;

  .title {
    font-weight: 900;
  }

  .subTitle {
    font-size: 12px;
    color: #6b7280;
  }
}

.nav {
  display: flex;
  gap: 12px;

  .link {
    text-decoration: none;
    font-weight: 700;
    .router-link-active {
      color: #3b82f6;
    }
  }
}
.link.router-link-active { color: #2563eb; }
.main {
  max-width: 980px;
  margin: 16px auto;
  padding: 0 16px;
}
</style>
