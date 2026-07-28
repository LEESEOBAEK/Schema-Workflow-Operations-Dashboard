<script setup lang="ts">
import { Check, Clock3, RotateCcw, X } from 'lucide-vue-next'
import type { RunReviewStatus, WorkflowRun } from '../../shared/types/dashboard'

const props = defineProps<{
  run: WorkflowRun
  saving: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  save: [payload: { status: RunReviewStatus; note: string }]
}>()

const status = ref<RunReviewStatus>('unreviewed')
const note = ref('')

watch(() => props.run, (run) => {
  status.value = run.review_status ?? 'unreviewed'
  note.value = run.review_note ?? ''
}, { immediate: true })

function submit() {
  if ((status.value === 'changes_requested' || status.value === 'deferred') && !note.value.trim()) return
  emit('save', { status: status.value, note: note.value.trim() })
}
</script>

<template>
  <div class="review-backdrop" @click.self="$emit('close')">
    <section class="review-dialog" role="dialog" aria-modal="true" aria-labelledby="run-review-title">
      <header>
        <div><small>User Review</small><h2 id="run-review-title">사용자 검토 기록</h2></div>
        <button type="button" title="닫기" @click="$emit('close')"><X :size="18" /></button>
      </header>

      <div class="review-run"><strong>{{ run.display_title || run.system_label || run.run_id }}</strong><code>{{ run.run_id }}</code></div>

      <form @submit.prevent="submit">
        <fieldset>
          <legend>검토 결과</legend>
          <label :class="{ active: status === 'approved' }"><input v-model="status" type="radio" value="approved" /><Check :size="16" /><span><strong>승인</strong><small>현재 결과를 다음 단계 기준으로 사용</small></span></label>
          <label :class="{ active: status === 'changes_requested' }"><input v-model="status" type="radio" value="changes_requested" /><RotateCcw :size="16" /><span><strong>수정 필요</strong><small>보완 후 다시 검토</small></span></label>
          <label :class="{ active: status === 'deferred' }"><input v-model="status" type="radio" value="deferred" /><Clock3 :size="16" /><span><strong>보류</strong><small>결정 근거나 시점이 아직 부족함</small></span></label>
        </fieldset>

        <label class="review-note"><span>검토 메모</span><textarea v-model="note" rows="5" maxlength="1000" placeholder="승인 근거 또는 수정·보류 이유를 기록하세요." /><small>수정 필요와 보류는 메모가 필수입니다.</small></label>
        <p v-if="error" class="review-error">{{ error }}</p>

        <footer><button type="button" class="cancel" @click="$emit('close')">취소</button><button type="submit" class="save" :disabled="saving || ((status === 'changes_requested' || status === 'deferred') && !note.trim())">{{ saving ? '저장 중' : '검토 저장' }}</button></footer>
      </form>
    </section>
  </div>
</template>

<style scoped>
.review-backdrop{position:fixed;inset:0;z-index:130;display:grid;place-items:center;padding:20px;background:#17201d73;backdrop-filter:blur(2px)}
.review-dialog{width:min(540px,100%);max-height:calc(100vh - 40px);overflow:auto;background:#fff;border:1px solid #cbd6d2;border-radius:7px;box-shadow:0 22px 60px #10251d33;color:#1c272b}
.review-dialog>header{min-height:66px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e0e6e4}.review-dialog>header small{color:#75817d;font-size:8px}.review-dialog h2{margin:3px 0 0;font-size:16px}.review-dialog>header button{width:32px;height:32px;display:grid;place-items:center;border:0;background:#f1f4f3;color:#586660;border-radius:5px}
.review-run{margin:14px 16px 0;padding:10px 11px;display:grid;gap:4px;background:#f4f7f6;border-left:3px solid #73847e}.review-run strong{font-size:10px}.review-run code{overflow-wrap:anywhere;color:#7b8783;font-size:7px}
.review-dialog form{padding:14px 16px 16px;display:grid;gap:13px}.review-dialog fieldset{margin:0;padding:0;border:0;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.review-dialog legend{margin-bottom:7px;font-size:9px;font-weight:800}.review-dialog fieldset label{min-height:70px;padding:10px;display:flex;align-items:flex-start;gap:7px;border:1px solid #d5ddda;background:#f7f9f8;border-radius:5px;cursor:pointer}.review-dialog fieldset label.active{border-color:#3f7b65;background:#eaf4ef;color:#235c47}.review-dialog fieldset input{position:absolute;opacity:0}.review-dialog fieldset span{display:grid;gap:4px}.review-dialog fieldset strong{font-size:9px}.review-dialog fieldset small{color:#6f7c77;font-size:7px;line-height:1.4}
.review-note{display:grid;gap:5px}.review-note>span{font-size:9px;font-weight:800}.review-note textarea{padding:9px 10px;resize:vertical;border:1px solid #cfd8d5;border-radius:5px;font:10px PretendardLocal,"Segoe UI",sans-serif;line-height:1.5}.review-note>small{color:#7a8782;font-size:8px}.review-error{margin:0;padding:8px 9px;color:#9d403a;background:#fff1ef;border-radius:4px;font-size:9px}
.review-dialog form>footer{display:flex;justify-content:flex-end;gap:7px}.review-dialog form>footer button{height:34px;padding:0 12px;border-radius:5px;font-size:9px;font-weight:800}.cancel{border:1px solid #ccd6d2;background:#fff;color:#53615c}.save{border:0;background:#1f7254;color:#fff}.save:disabled{opacity:.5}
@media(max-width:560px){.review-dialog fieldset{grid-template-columns:1fr}.review-dialog fieldset label{min-height:48px}}
</style>
