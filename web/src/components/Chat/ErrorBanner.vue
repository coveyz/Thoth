<!--
 * @Author: coveyz zhangkairong123@qq.com
 * @Date: 2026-03-18 21:22:43
 * @LastEditors: coveyz zhangkairong123@qq.com
 * @LastEditTime: 2026-03-19 18:16:56
 * @FilePath: /Thoth/web/src/components/chat/ErrorBanner.vue
-->
<script setup lang="ts">
/**
 * 组件职责：展示错误信息，并允许用户关闭。
 * 注意：`defineProps()` 在同一个 `<script setup>` 中只能调用一次。
 */

defineProps<{ text: string }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="error">
    <div class="title">错误</div>
    <div class="body">{{ text }}</div>
    <button class="btn" @click="$emit('close')">关闭</button>
  </div>
</template>


<style scoped>
.error {
  padding: 12px;
  background: #fff7f7;
  border-bottom: 1px solid #e5e7eb;
}

.title {
  font-weight: 900;
  color: #b91c1c;
  margin-bottom: 6px;
}

.body {
  font-size: 12px;
  white-space: pre-wrap;
  margin-bottom: 10px;
}

.btn {
  padding: 8px 10px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
</style>
