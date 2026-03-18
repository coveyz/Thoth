<script setup lang="ts">
import { useChatStore } from '@/stores/chat';
import { computed } from 'vue';


const chat = useChatStore();

const options = computed(() => [
  { label: '默认（后端决定）', value: '' },
  { label: 'fake-model（Week1）', value: 'fake-model' },
]);
</script>

<template>
  <section>
    <h1 class="h1">Setting</h1>
    <p class="p"> Week1：这里只保留“切大模型”的入口，真正切换放 Week2+。 </p>

    <div class="card">
      <div class="row">
        <div class="label"> Model </div>
        <select v-model="chat.model" class="select">
          <option v-for="o in options" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
      </div>
    </div>
  </section>
</template>

<style scoped>
.h1 { margin: 0 0 6px; font-size: 18px; }
.p { margin: 0 0 12px; color: #6b7280; font-size: 12px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
.row { display: flex; align-items: center; gap: 12px; }
.label { width: 80px; font-weight: 800; font-size: 12px; color: #374151; }
.select { flex: 1; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; }
</style>
