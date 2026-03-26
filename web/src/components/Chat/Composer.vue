<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ disabled: boolean, canStop: boolean }>();
const emit = defineEmits<{ send: [text: string], stop: [] }>();

const input = ref('');

const doSend = () => {
  const text = input.value;
  input.value = '';
  emit('send', text);
};
</script>

<template>
  <div class="composer">
    <input v-model="input" class="input" :disabled="props.disabled" placeholder="输入消息，Enter 发送"
      @keydown.enter.prevent="doSend" />

    <button class="btn primary" :disabled="props.disabled || !input.trim()" @click="doSend">
      发送
    </button>

    <button class="btn danger" :disabled="!props.canStop" @click="$emit('stop')">
      停止
    </button>
  </div>
</template>


<style scoped>
.composer {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
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
</style>
