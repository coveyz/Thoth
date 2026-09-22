<script setup lang="ts">
import type {
  ChatDisplayError,
} from '@/types/chat';

defineProps<{
  error: ChatDisplayError;
}>();

defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="error" role="alert">
    <div class="header">
      <div class="title">
        {{ error.title }}
      </div>

      <button class="close" type="button" aria-label="关闭错误提示" @click="$emit('close')">
        关闭
      </button>
    </div>

    <div class="body">
      {{ error.message }}
    </div>

    <div class="meta">
      <span class="meta-item">
        错误码：{{ error.code }}
      </span>

      <span v-if="error.requestId" class="meta-item">
        请求 ID：{{ error.requestId }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.error {
  padding: 12px;
  background: #fff7f7;
  border-bottom: 1px solid #fecaca;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title {
  font-weight: 900;
  color: #b91c1c;
}

.body {
  margin-top: 6px;
  font-size: 13px;
  color: #7f1d1d;
  white-space: pre-wrap;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.meta-item {
  padding: 3px 7px;
  border: 1px solid #fecaca;
  border-radius: 999px;
  background: #fff;
  color: #991b1b;
  font-family: monospace;
  font-size: 11px;
}

.close {
  padding: 6px 9px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff;
  color: #991b1b;
  cursor: pointer;
}

.close:hover {
  background: #fef2f2;
}
</style>
