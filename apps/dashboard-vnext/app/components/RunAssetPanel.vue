<script setup lang="ts">
import { Box, FileCheck2, X } from 'lucide-vue-next'
import type { RunReferenceDetail, WorkflowRun } from '../../shared/types/dashboard'

const props = defineProps<{
  run: WorkflowRun
  kind: 'evidence' | 'artifact'
}>()

defineEmits<{ close: [] }>()

const isEvidence = computed(() => props.kind === 'evidence')
const items = computed<RunReferenceDetail[]>(() => {
  const details = isEvidence.value ? props.run.evidence_details : props.run.artifact_details
  if (details?.length) return details
  const ids = isEvidence.value ? (props.run.evidence_ids ?? []) : (props.run.artifact_ids ?? [])
  return ids.map(id => ({
    id,
    title: id,
    summary: '원본에는 식별자만 있으며 별도의 설명이 기록되지 않았습니다.',
  }))
})
const sourcePath = computed(() => {
  const root = props.run.source_path?.replace(/[\\/]+$/, '')
  if (!root) return '원본 경로 정보 없음'
  return isEvidence.value
    ? `${root}\\07_fulfillment\\data\\evidence_filled.json`
    : `${root}\\artifacts_manifest.json`
})
</script>

<template>
  <div class="asset-backdrop" @click.self="$emit('close')">
    <section class="asset-panel" role="dialog" aria-modal="true" :aria-labelledby="`${kind}-panel-title`">
      <header>
        <div>
          <small>{{ isEvidence ? 'Evidence References' : 'Artifact References' }}</small>
          <h2 :id="`${kind}-panel-title`">{{ isEvidence ? '근거 목록' : '산출물 목록' }}</h2>
        </div>
        <button type="button" title="닫기" @click="$emit('close')"><X :size="18" /></button>
      </header>

      <div class="asset-run">
        <span>{{ run.display_title || run.system_label || run.run_id }}</span>
        <code>{{ run.run_id }}</code>
      </div>

      <div v-if="items.length" class="asset-items">
        <article v-for="item in items" :key="item.id">
          <FileCheck2 v-if="isEvidence" :size="17" />
          <Box v-else :size="17" />
          <div>
            <span class="asset-item-heading"><strong>{{ item.title }}</strong><em v-if="item.status">{{ item.status }}</em></span>
            <p>{{ item.summary }}</p>
            <code v-if="item.path">{{ item.path }}</code>
            <small v-if="!isEvidence && (item.type || item.role)">{{ [item.type, item.role].filter(Boolean).join(' · ') }}</small>
          </div>
        </article>
      </div>
      <div v-else class="asset-empty">
        <strong>{{ isEvidence ? '등록된 근거가 없습니다.' : '등록된 산출물이 없습니다.' }}</strong>
        <span>이 Run의 원본 데이터에도 해당 참조가 없습니다.</span>
      </div>

      <footer>
        <span>원본 파일</span>
        <code>{{ sourcePath }}</code>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.asset-backdrop{position:fixed;inset:0;z-index:125;display:flex;justify-content:flex-end;background:#17201d73;backdrop-filter:blur(2px)}
.asset-panel{width:min(520px,100%);height:100%;overflow:auto;background:#f5f8f7;border-left:1px solid #cbd6d2;box-shadow:-18px 0 48px #10251d24;color:#1c272b}
.asset-panel>header{height:70px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #dce4e1}
.asset-panel>header small{color:#73807b;font-size:9px;font-weight:750}.asset-panel h2{margin:4px 0 0;font-size:18px}
.asset-panel>header button{width:34px;height:34px;display:grid;place-items:center;border:1px solid #d3dcda;background:#fff;color:#52615c;border-radius:5px}
.asset-run{margin:18px 18px 0;padding:13px;display:grid;gap:5px;background:#fff;border:1px solid #dce4e1;border-radius:6px}
.asset-run span{font-size:11px;font-weight:800}.asset-run code{overflow-wrap:anywhere;color:#74817c;font-size:8px}
.asset-items{padding:12px 18px;display:grid;gap:7px}.asset-items article{min-height:62px;padding:10px 11px;display:grid;grid-template-columns:18px minmax(0,1fr);align-items:start;gap:9px;background:#fff;border:1px solid #dce4e1;border-radius:5px;color:#2b6d54}.asset-items article>svg{margin-top:2px}.asset-items article>div{min-width:0;display:grid;gap:5px}.asset-item-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.asset-item-heading strong{color:#263832;font-size:10px;overflow-wrap:anywhere}.asset-item-heading em{padding:2px 5px;color:#2b6d54;background:#e8f3ed;border-radius:999px;font-size:7px;font-style:normal;font-weight:800}.asset-items p{margin:0;color:#53625d;font-size:9px;line-height:1.5;overflow-wrap:anywhere}.asset-items code{overflow-wrap:anywhere;color:#4d5e57;font-size:8px}.asset-items small{color:#7b8783;font-size:7px}
.asset-empty{margin:12px 18px;padding:30px 18px;display:grid;gap:6px;text-align:center;background:#fff;border:1px dashed #cbd6d2;border-radius:6px}.asset-empty strong{font-size:11px}.asset-empty span{color:#74817c;font-size:9px}
.asset-panel>footer{margin:0 18px 18px;padding:12px;display:grid;gap:6px;background:#eef3f1;border-radius:5px}.asset-panel>footer span{color:#75827d;font-size:8px}.asset-panel>footer code{overflow-wrap:anywhere;color:#40514a;font-size:8px}
</style>
