<script setup lang="ts">
import { ref } from 'vue';

import type { ToolChoice } from '@/types/chat';


const props = defineProps<{
  disabled: boolean,
  canStop: boolean,
  toolChoice: ToolChoice
}>();
const emit = defineEmits<{
  send: [text: string],
  stop: [],
  'update:toolChoice': [value: ToolChoice]
}>();

const input = ref('');

const toolOptions: Array<{ label: string, value: ToolChoice }> = [
  { label: '自动决策', value: 'auto' },
  { label: '禁用工具', value: 'none' },
  { label: '强制 extract_todos', value: 'extract_todos' },
  { label: '强制 summarize', value: 'summarize' },
  { label: '强制 make_plan', value: 'make_plan' }
]

const doSend = () => {
  const text = input.value;
  input.value = '';
  emit('send', text);
};

const updateToolChoice = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  emit('update:toolChoice', target.value as ToolChoice);
}

</script>

<template>
  <div class="composer">
    <div class="controls">
      <label class="tool-choice">
        <span class="tool-label">工具策略</span>
        <select class="select" :value="props.toolChoice" :disabled="props.disabled" @change="updateToolChoice">
          <option v-for="option in toolOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>

    <div class="actions">
      <input v-model="input" class="input" :disabled="props.disabled" placeholder="输入消息，Enter 发送"
        @keydown.enter.prevent="doSend" />

      <button class="btn primary" :disabled="props.disabled || !input.trim()" @click="doSend">
        发送
      </button>

      <button class="btn danger" :disabled="!props.canStop" @click="$emit('stop')">
        停止
      </button>
    </div>
  </div>
</template>


<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  padding: 12px;
  gap: 10px;
}

.controls, .actions {
  display: flex;
  align-items: center;
  gap: 8px
}

.tool-choice {
  display: flex;
  align-items: center;
  gap: 8px
}
.tool-label{
  font-size: 12px;
  color: #374151;
  font-weight: 800;
}
.select {
  min-width: 190px;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}

.input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}

.btn {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.danger {
  background: #b91c1c;
  border-color: #b91c1c;
  color: #fff;
}

@media (max-width: 720px) {
  .actions {
    flex-wrap: wrap;
  }
  .tool-choice {
    width: 100%;
    justify-content: space-between;
  }
  .select, input {
    width: 100%;
  }
}
</style>
