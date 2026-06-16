<script setup lang="ts">
import { computed } from 'vue';

import type { ChatTurnTrace, ToolChoice, ToolTimeLineEvent } from '@/types/chat';

const props = defineProps<{
  turns: ChatTurnTrace[]
}>()

/** 最新的放最上面， 方便观察 */
const displayTurns = computed(() => {
  return [...props.turns].reverse();
})

const getChoiceText = (choice: ToolChoice) => {
  if (choice === 'auto') return '自动决策';
  if (choice === 'none') return '禁用工具';
  return `强制工具: ${choice}`;
}

const getOutcomeText = (outcome: string) => {
  if (outcome === 'pending') return '进行中';
  if (outcome === 'done') return '已完成';
  if (outcome === 'stopped') return '已停止';
  return '错误';
}

const formatTime = (value: number) => {
  return new Date(value).toLocaleTimeString();
}

const formatJson = (value: unknown) => {
  return JSON.stringify(value, null, 2) ?? 'undefined';
}

const getEventTitle = (event: ToolTimeLineEvent) => {
  if (event.type === 'tool_call') return '工具调用';
  if (event.type === 'tool_result') return '工具结果';
  return '工具错误';
}

</script>

<template>
  <section class="panel">
    <div class="panel-top">
      <div class="title">Tool Timeline</div>
      <div class="desc">week2: </div>
    </div>
    <div class="empty" v-if="!displayTurns.length">
      还没有请求记录。发送一条消息后，这里会显示本轮的工具轨迹
    </div>
    <div class="turn" v-for="turn in displayTurns" :key="turn.id">
      <div class="turn-top">
        <div class="turn-title">{{ getChoiceText(turn.toolChoice) }}</div>
        <div class="turn-outcome" :class="turn.outcome">{{ getOutcomeText(turn.outcome) }}</div>
      </div>
      <div class="turn-meta">
        <span>time: {{ formatTime(turn.createdAt) }} </span>
        <span>requestId: {{ turn.requestId || 'pending' }} </span>
        <span>model: {{ turn.model || 'pending' }} </span>
      </div>
      <div class="turn-user">
        <div class="label">用户输入</div>
        <div class="text"> {{ turn.userText }}</div>
      </div>
      <div class="empty-event" v-if="!turn.events.length">
        {{ turn.outcome === 'pending' ? '等待服务端返回工具决策' : '本轮没有工具调用' }}
      </div>

      <div v-for="event in turn.events" :key="event.id" :class="event.type" class="event">
        <div class="event-head">
          <div class="event-title">{{ getEventTitle(event) }}</div>
          <div class="event-time">{{ formatTime(event.createdAt) }}</div>
        </div>

        <template v-if="event.type === 'tool_call'">
          <div class="row">
            <span class="label">name</span>
            <span>{{ event.payload.name }}</span>
          </div>
          <div class="row">
            <div class="label">reason</div>
            <span>{{ event.payload.reason }}</span>
          </div>
          <div class="block">
            <span class="label">arguments</span>
            <pre class="json">{{ formatJson(event.payload.arguments) }}</pre>
          </div>
        </template>
        <template v-else-if="event.type === 'tool_result'">
          <div class="row">
            <span class="label">name</span>
            <span>{{ event.payload.name || 'unknown' }}</span>
          </div>
          <div class="block">
            <span class="label">result</span>
            <pre class="json">{{ formatJson(event.payload.result) }}</pre>
          </div>
        </template>
        <template v-else>
          <div class="row">
            <span class="label">name</span>
            <span>{{ event.payload.name || 'unknown' }}</span>
          </div>
          <div class="row">
            <span class="label">message</span>
            <span>{{ event.payload.message }}</span>
          </div>
        </template>

        <div class="turn-error" v-if="turn.errorText">
          <div class="label">chat error</div>
          <div class="text">{{ turn.errorText }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.panel {
  border-top: 1px solid #e5e7eb;
  background: #fcfcfd;
  padding: 12px;

}

.title {
  font-size: 13px;
  font-weight: 900;
  color: #111827;
}

.desc {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.empty,
.empty-event {
  padding: 12px;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  color: #6b7280;
  font-size: 12px;
  background: #fff;
  margin-top: 4px;
}

.turn {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;

}

.turn-top,
.turn-meta,
.event-head,
.row {
  display: flex;
  justify-content: space-between;
  gap: 12px
}

.turn-title,
.event-title {
  font-weight: 800;
  color: #111827;
}

.turn-outcome {
  font-size: 12px;
  font-weight: 800;
}

.turn-outcome.pending {
  color: #a16207;
}

.turn-outcome.done {
  color: #166534;
}

.turn-outcome.stopped {
  color: #1d4ed8;
}

.turn-outcome.error {
  color: #b91c1b;
}

.turn-user,
.block,
.turn-error {
  margin-top: 10px
}

.label {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}

.text {
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #111827
}

.event {
  margin-top: 10px;
  padding: 10px;
  border-radius: 10px;
  background: #f9fafb;
}

.event.tool_call {
  border-left: 4px solid #2563eb;
}

.event.tool_result {
  border-left: 4px solid #16a34a;
}

.event.tool_error {
  border-left: 4px solid #b91c1c;
}

.event-time {
  font-size: 12px;
  color: #6b7280;
}

.turn-error {
  padding: 10px;
  border-radius: 10px;
  background: #fff7f7;
}

.json {
  margin: 6px 0 0;
  padding: 10px;
  overflow: auto;
  border-radius: 8px;
  background: #111827;
  color: #f9fafb;
  font-size: 12px;
  line-height: 1.5;
}
</style>
