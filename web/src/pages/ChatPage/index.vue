<script setup lang="ts">
import { ChatView } from '@/components';
</script>

<template>
  <section>
    <h1 class="h1">Chat</h1>
    <p class="p">Week1：流式输出 + Stop + 错误提示 + 自动滚动。</p>
    <chat-view />
  </section>
</template>



<style scoped>
.h1 {
  margin: 0 0 6px;
  font-size: 18px;
}

.p {
  margin: 0 0 12px;
  color: #6b7280;
  font-size: 12px;
}
</style>
