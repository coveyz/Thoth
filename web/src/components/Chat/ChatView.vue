<!--
 * @Author: coveyz zhangkairong123@qq.com
 * @Date: 2026-03-18 21:21:27
 * @LastEditors: coveyz zhangkairong123@qq.com
 * @LastEditTime: 2026-03-19 18:17:33
 * @FilePath: /Thoth/web/src/components/Chat/ChatView.vue
-->
<script setup lang="ts">
import { computed } from 'vue';

import { useChatStore } from '@/stores/chat';

import Composer from './Composer.vue';
import ErrorBanner from './ErrorBanner.vue';
import MessageList from './MessageList.vue';

const chat = useChatStore();

const statusText = computed(() => {
  if (chat.status === 'streaming') {
    return '生成中...';
  }
  if (chat.status === 'stopping') {
    return '停止中...';
  }
  if (chat.status === 'error') {
    return '发生错误';
  }
  return '就绪';
});

</script>

<template>
  <div class="card">
    <div class="top">
      <div class="left"> Status: {{ statusText }} </div>
      <div class="right"> conversation: {{ chat.conversationId }} </div>
    </div>

    <ErrorBanner v-if="chat.errorText" :text="chat.errorText" @close="chat.clearError" />
    <MessageList :messages="chat.messages" :status="chat.status" />
    <Composer :disabled="chat.isBusy" :canStop="chat.status === 'streaming'" @send="chat.send" @stop="chat.stop" />
  </div>
</template>



<style scoped>
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.top {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.left {
  font-weight: 900;
  font-size: 12px;
}

.right {
  color: #6b7280;
  font-size: 12px;
}
</style>
