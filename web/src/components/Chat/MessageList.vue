<!--
 * @Author: coveyz zhangkairong123@qq.com
 * @Date: 2026-03-18 21:24:31
 * @LastEditors: coveyz zhangkairong123@qq.com
 * @LastEditTime: 2026-03-25 21:46:58
 * @FilePath: /Thoth/web/src/components/Chat/MessageList.vue
-->
<script setup lang="ts">
import { computed } from 'vue';

import { useAutoScroll } from '@/hooks/useAutoScroll';
import type { ChatMessage } from '@/types/chat';

const props = defineProps<{
  messages: ChatMessage[]
  status: 'idle' | 'streaming' | 'stopping' | 'error';
}>();

const lastContent = computed(() => props.messages[props.messages.length - 1]?.content || '');
const { bottomRef } = useAutoScroll(() => `${props.messages.length}: ${lastContent.value}`);
</script>

<template>
  <div class="list">
    <div class="msg" v-for="message in props.messages" :key="message.id" :class="message.role">
      <div class="role">{{ message.role }}</div>
      <div class="content">{{ message.content }}</div>
    </div>

    <div class="hint" v-if="props.status === 'streaming'">生成中...</div>
    <div class="hint" v-else-if="props.status === 'stopping'">停止中...</div>

    <div ref="bottomRef" style="height: 1px;"></div>
  </div>
</template>


<style scoped>
.list {
  height: 560px;
  overflow: auto;
  padding: 12px;
  background: #fafafa;
}

.msg {
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 10px;
  margin-bottom: 10px;
  background: #fff;
}

.msg.user {
  border-left: 4px solid #2563eb;
}

.msg.assistant {
  border-left: 4px solid #16a34a;
}

.role {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}

.content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.hint {
  color: #6b7280;
  font-size: 12px;
  padding: 4px 0;
}
</style>
