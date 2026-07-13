<script setup lang="ts">
import type { RagSource } from '@/types/chat'

const props = defineProps<{
  sources: RagSource[]
}>();

const formatScore = (score: number) => {
  return score.toFixed(4);
};

</script>

<template>
  <div class="sources" v-if="props.sources.length > 0">
    <div class="title"> Sources </div>
    <div class="source" v-for="source in props.sources" :key="source.id">
      <div class="source-head">
        <div class="source-title">{{ source.title }}</div>
        <div class="score"> {{ formatScore(source.score) }} </div>
      </div>

      <div class="meta">
        {{ source.source }} · chunk {{ source.chunkIndex + 1 }}
      </div>

      <div class="content">
        {{ source.content }}
      </div>
    </div>
  </div>
</template>


<style scoped>
.sources {
  border-top: 1px solid #e5e7eb;
  padding: 12px;
  background: #f9fafb;
}

.title {
  font-size: 13px;
  font-weight: 800;
  color: #111827;
  margin-bottom: 10px;
}

.source {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
}

.source-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.source-title {
  font-size: 13px;
  font-weight: 800;
  color: #111827;
}

.score {
  font-size: 12px;
  color: #2563eb;
  font-weight: 800;
}

.meta {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}

.content {
  font-size: 13px;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}
</style>
