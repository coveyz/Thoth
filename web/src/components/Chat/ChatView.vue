<script setup lang="ts">
import { computed } from 'vue';

import { useChatStore } from '@/stores/chat';

import Composer from './Composer.vue';
import ErrorBanner from './ErrorBanner.vue';
import MessageList from './MessageList.vue';
import ToolTimeline from './ToolTimeline.vue';

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

const toolChoiceText = computed(() => {
  if (chat.toolChoice === 'auto') return '自动决策';
  if (chat.toolChoice === 'none') return '禁用工具';
  return `强制工具: ${chat.toolChoice}`;
})

</script>

<template>
  <div class="card">
    <div class="top">
      <div class="meta-item">Status: {{ statusText }}</div>
      <div class="meta-item">requestId: {{ chat.activeRequestId }}</div>
      <div class="meta-item">model: {{ chat.activeModel }}</div>
      <div class="meta-item">tool: {{ toolChoiceText }}</div>
      <div class="meta-item">Conversation: {{ chat.conversationId }}</div>
    </div>

    <ErrorBanner v-if="chat.errorText" :text="chat.errorText" @close="chat.clearError" />
    <MessageList :messages="chat.messages" :status="chat.status" />
    <ToolTimeline :turns="chat.turns" />
    <Composer :disabled="chat.isBusy" :canStop="chat.status === 'streaming'" :toolChoice="chat.toolChoice"
      @send="chat.send" @stop="chat.stop" @update:toolChoice="chat.setToolChoice" />
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
  flex-wrap: wrap;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
  gap: 8px;
}

.meta-item {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-weight: 700;
  color: #374151
}
</style>
