<script setup lang="ts">
import { AlertTriangle, Box, Check, ChevronRight, FileCheck2, FileText, GitBranch, RefreshCw, ShieldCheck, X } from 'lucide-vue-next'
import type { PipelineReviewOverview, PipelineReviewStatus, RunStatus } from '../../shared/types/dashboard'

const props = defineProps<{
  overview: PipelineReviewOverview | null
  loading: boolean
  error: string
}>()

defineEmits<{ close: []; refresh: [] }>()

function statusLabel(status: PipelineReviewStatus) {
  return ({ PASS: '통과', EVIDENCE_NEEDED: '근거 부족', HOLD: '보류', NOT_RUN: '실행 전' })[status]
}

function runStatusLabel(status: RunStatus) {
  return ({ pass: '통과', evidence_insufficient: '근거 부족', hold: '보류', unknown: '확인 필요' })[status]
}

function platformLabel(platform: string) {
  return platform === 'claude' ? 'Claude Code' : platform === 'antigravity' ? 'Antigravity' : 'Codex'
}
</script>

<template>
  <div class="review-backdrop" @click.self="$emit('close')">
    <section class="review-panel" role="dialog" aria-modal="true" aria-labelledby="pipeline-review-title">
      <header>
        <div><small>Pipeline Trace Review</small><h2 id="pipeline-review-title">파이프라인 상세 검토</h2></div>
        <div class="header-actions"><button type="button" title="다시 읽기" :disabled="loading" @click="$emit('refresh')"><RefreshCw :size="17" /></button><button type="button" title="닫기" @click="$emit('close')"><X :size="18" /></button></div>
      </header>

      <div v-if="loading && !overview" class="review-empty">작업 기준과 실행 결과를 연결하고 있습니다.</div>
      <div v-else-if="error && !overview" class="review-empty error"><AlertTriangle :size="21" /><strong>상세 검토를 준비하지 못했습니다.</strong><span>{{ error }}</span></div>

      <main v-else-if="overview">
        <section class="review-hero">
          <div class="hero-heading"><span class="review-status" :class="overview.status.toLowerCase()"><Check v-if="overview.status === 'PASS'" :size="14" /><AlertTriangle v-else :size="14" />{{ statusLabel(overview.status) }}</span><small>{{ overview.operation_kind === 'continue' ? '이어가기' : overview.operation_kind === 'branch' ? '분기' : '독립 작업' }}</small></div>
          <h3>{{ overview.session_name }}</h3>
          <p>{{ overview.brief.current_situation || '실행 문서에 현재 상황 설명이 없거나 템플릿 없이 만든 작업입니다.' }}</p>
          <div class="template-reference"><FileText :size="16" /><div><span>실행 기준</span><strong>{{ overview.template?.name ?? '템플릿 참조 없음' }}</strong><small>{{ overview.brief.path ?? '실행 문서 경로 없음' }}</small></div></div>
        </section>

        <section class="review-metrics"><article><small>연결 Run</small><strong>{{ overview.summary.run_count }}</strong></article><article><small>통과 Run</small><strong>{{ overview.summary.pass_count }}</strong></article><article><small>근거</small><strong>{{ overview.summary.evidence_count }}</strong></article><article><small>산출물</small><strong>{{ overview.summary.artifact_count }}</strong></article></section>

        <section class="review-section pipeline-flow">
          <header><div><GitBranch :size="16" /><h3>작업 흐름</h3></div><span>실행 기준부터 완료 검증까지</span></header>
          <div class="stage-list"><template v-for="(stage, index) in overview.stages" :key="stage.id"><article :class="stage.status.toLowerCase()"><span><Check v-if="stage.status === 'PASS'" :size="14" /><AlertTriangle v-else :size="14" /></span><div><small>{{ statusLabel(stage.status) }}</small><strong>{{ stage.label }}</strong><p>{{ stage.summary }}</p><code v-if="stage.source_path">{{ stage.source_path }}</code></div></article><ChevronRight v-if="index < overview.stages.length - 1" :size="16" /></template></div>
        </section>

        <section class="review-section brief-review">
          <header><div><FileCheck2 :size="16" /><h3>템플릿 실행본</h3></div><span>{{ overview.brief.sections.length }}개 섹션</span></header>
          <div v-if="overview.brief.available" class="brief-summary"><div><span>문서</span><strong>{{ overview.brief.title }}</strong></div><div><span>남은 작성·확인 항목</span><strong>{{ overview.brief.placeholder_count + overview.brief.validation_marker_count + overview.brief.unchecked_item_count }}개</strong></div></div>
          <div v-if="overview.brief.sections.length" class="brief-sections"><details v-for="section in overview.brief.sections" :key="section.id"><summary>{{ section.title }}<ChevronRight :size="14" /></summary><pre>{{ section.content || '내용 없음' }}</pre></details></div>
          <p v-else class="section-empty">연결된 템플릿 실행본이 없습니다. 실제 Run 결과는 아래에서 계속 검토할 수 있습니다.</p>
        </section>

        <section class="review-section run-review">
          <header><div><ShieldCheck :size="16" /><h3>실행 결과</h3></div><span>{{ overview.runs.length }}개 Run</span></header>
          <div v-if="overview.runs.length" class="run-cards">
            <article v-for="run in overview.runs" :key="run.run_id">
              <header><div><span class="run-state" :class="run.status">{{ runStatusLabel(run.status) }}</span><small>{{ platformLabel(run.platform) }} · {{ run.created_at || '시간 정보 없음' }}</small></div><strong>{{ run.label }}</strong><code>{{ run.run_id }}</code></header>
              <p class="next-action"><span>다음 행동</span>{{ run.next_action }}</p>
              <div class="result-columns">
                <section><h4><FileCheck2 :size="14" />근거 {{ run.evidence.length }}</h4><div v-if="run.evidence.length"><article v-for="item in run.evidence" :key="item.id"><strong>{{ item.title }}</strong><p>{{ item.summary }}</p><small>{{ item.status ?? item.id }}</small></article></div><p v-else>등록된 근거가 없습니다.</p></section>
                <section><h4><Box :size="14" />산출물 {{ run.artifacts.length }}</h4><div v-if="run.artifacts.length"><article v-for="item in run.artifacts" :key="item.id"><strong>{{ item.title }}</strong><p>{{ item.summary }}</p><code>{{ item.path ?? item.id }}</code></article></div><p v-else>등록된 산출물이 없습니다.</p></section>
              </div>
              <footer><span>원본 Run</span><code>{{ run.source_path }}</code></footer>
            </article>
          </div>
          <p v-else class="section-empty">아직 이 작업 세션에 연결된 Run이 없습니다.</p>
        </section>

        <section v-if="overview.issues.length" class="review-section issues">
          <header><div><AlertTriangle :size="16" /><h3>확인할 항목</h3></div><span>{{ overview.issues.length }}개</span></header>
          <div><article v-for="issue in overview.issues" :key="`${issue.code}-${issue.source_path ?? ''}`" :class="issue.severity"><strong>{{ issue.code }}</strong><p>{{ issue.message }}</p><code v-if="issue.source_path">{{ issue.source_path }}</code></article></div>
        </section>
      </main>
    </section>
  </div>
</template>

<style scoped>
.review-backdrop{position:fixed;inset:0;z-index:120;display:flex;justify-content:flex-end;background:#17201d73;backdrop-filter:blur(2px)}.review-panel{width:min(980px,100%);height:100%;overflow:auto;background:#f4f7f6;border-left:1px solid #cbd6d2;box-shadow:-18px 0 48px #10251d24;color:#1c272b}.review-panel>header{height:70px;padding:0 20px;position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #dce4e1}.review-panel>header small{color:#73807b;font-size:9px;font-weight:750}.review-panel h2{margin:4px 0 0;font-size:18px}.header-actions{display:flex;gap:6px}.header-actions button{width:34px;height:34px;display:grid;place-items:center;border:1px solid #d3dcda;background:#fff;color:#52615c;border-radius:5px}.header-actions button:disabled{opacity:.5}.review-empty{min-height:calc(100vh - 70px);padding:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;color:#677570}.review-empty strong{font-size:14px;color:#293832}.review-empty span{max-width:480px;font-size:10px;line-height:1.55}.review-empty.error{color:#9b433d}.review-panel main{padding:20px;display:grid;gap:14px}.review-hero,.review-section{padding:17px;background:#fff;border:1px solid #dce4e1;border-radius:6px}.hero-heading{display:flex;align-items:center;justify-content:space-between}.hero-heading>small{color:#76837e;font-size:8px}.review-status{padding:4px 7px;display:flex;align-items:center;gap:4px;border-radius:999px;font-size:8px;font-weight:800}.review-status.pass{color:#1f7254;background:#e8f3ed}.review-status.evidence_needed,.review-status.not_run{color:#9a5a17;background:#fbf0df}.review-status.hold{color:#9c413b;background:#f9e9e7}.review-hero h3{margin:13px 0 6px;font-size:18px}.review-hero>p{margin:0;color:#52615c;font-size:10px;line-height:1.6;white-space:pre-wrap}.template-reference{margin-top:14px;padding:10px;display:grid;grid-template-columns:18px 1fr;gap:8px;background:#f2f6f4;color:#2d6b53;border-left:3px solid #4d806d}.template-reference>div{min-width:0;display:grid;gap:3px}.template-reference span,.template-reference small{color:#71807a;font-size:8px}.template-reference strong{font-size:10px}.template-reference small{overflow-wrap:anywhere;font-family:"Cascadia Code",monospace}.review-metrics{display:grid;grid-template-columns:repeat(4,1fr);background:#fff;border:1px solid #dce4e1;border-radius:6px}.review-metrics article{padding:14px;border-right:1px solid #e1e7e5}.review-metrics article:last-child{border-right:0}.review-metrics small{display:block;color:#78847f;font-size:8px}.review-metrics strong{display:block;margin-top:5px;font-size:19px}.review-section>header{display:flex;align-items:center;justify-content:space-between}.review-section>header div{display:flex;align-items:center;gap:7px}.review-section h3{margin:0;font-size:12px}.review-section>header>span{color:#74817c;font-size:8px}
.stage-list{margin-top:13px;display:flex;align-items:stretch;gap:6px}.stage-list>article{min-width:0;flex:1;padding:10px 8px;display:grid;grid-template-columns:20px 1fr;gap:6px;background:#f5f8f7;border-top:3px solid #78968a;border-radius:4px}.stage-list>article>span{width:20px;height:20px;display:grid;place-items:center;border-radius:50%;background:#e2ebe7;color:#3f715e}.stage-list>article>div{min-width:0;display:grid;gap:3px}.stage-list small{color:#74817c;font-size:7px}.stage-list strong{font-size:9px}.stage-list p{margin:0;color:#62706b;font-size:8px;line-height:1.4}.stage-list code{overflow:hidden;text-overflow:ellipsis;color:#71807a;font-size:7px}.stage-list>article.evidence_needed,.stage-list>article.not_run{border-color:#c68a43}.stage-list>article.evidence_needed>span,.stage-list>article.not_run>span{color:#9a5a17;background:#fbf0df}.stage-list>article.hold{border-color:#b25750}.stage-list>article.hold>span{color:#9c413b;background:#f9e9e7}.stage-list>svg{align-self:center;flex:none;color:#9aa6a1}.brief-summary{margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:7px}.brief-summary>div{padding:10px;display:grid;gap:3px;background:#f4f7f6;border-radius:4px}.brief-summary span{color:#74817c;font-size:8px}.brief-summary strong{font-size:10px}.brief-sections{margin-top:9px;display:grid;gap:5px}.brief-sections details{background:#f7f9f8;border:1px solid #e0e6e4;border-radius:4px}.brief-sections summary{min-height:36px;padding:0 10px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-size:9px;font-weight:800}.brief-sections details[open] summary svg{transform:rotate(90deg)}.brief-sections pre{margin:0;padding:11px;border-top:1px solid #e0e6e4;white-space:pre-wrap;overflow-wrap:anywhere;color:#4d5d57;font:8px/1.6 "Cascadia Code",monospace}.section-empty{margin:12px 0 0;padding:18px;text-align:center;color:#74817c;background:#f7f9f8;border:1px dashed #cbd6d2;border-radius:5px;font-size:9px}
.run-cards{margin-top:12px;display:grid;gap:9px}.run-cards>article{overflow:hidden;border:1px solid #dce4e1;border-radius:5px}.run-cards>article>header{padding:11px;background:#f6f8f7;display:grid;gap:5px}.run-cards>article>header>div{display:flex;align-items:center;justify-content:space-between}.run-cards>article>header strong{font-size:11px}.run-cards>article>header code{overflow-wrap:anywhere;color:#74817c;font-size:7px}.run-cards>article>header small{color:#74817c;font-size:8px}.run-state{padding:3px 6px;border-radius:999px;font-size:7px;font-weight:800}.run-state.pass{color:#1f7254;background:#e8f3ed}.run-state.evidence_insufficient,.run-state.unknown{color:#9a5a17;background:#fbf0df}.run-state.hold{color:#9c413b;background:#f9e9e7}.next-action{margin:0;padding:9px 11px;display:grid;grid-template-columns:70px 1fr;gap:8px;color:#46554f;font-size:9px;border-top:1px solid #e2e7e5}.next-action span{color:#74817c;font-weight:800}.result-columns{padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;border-top:1px solid #e2e7e5}.result-columns>section{min-width:0;padding:10px;background:#f7f9f8;border-radius:4px}.result-columns h4{margin:0 0 8px;display:flex;align-items:center;gap:5px;font-size:9px}.result-columns>section>div{display:grid;gap:6px}.result-columns article{padding-top:6px;border-top:1px solid #e1e6e4}.result-columns article:first-child{padding-top:0;border-top:0}.result-columns strong{font-size:8px}.result-columns p{margin:3px 0;color:#586761;font-size:8px;line-height:1.45}.result-columns small,.result-columns code{display:block;overflow-wrap:anywhere;color:#798580;font-size:7px}.run-cards>article>footer{padding:8px 11px;display:grid;grid-template-columns:70px 1fr;gap:8px;background:#eef3f1}.run-cards>article>footer span{color:#74817c;font-size:8px}.run-cards>article>footer code{overflow-wrap:anywhere;font-size:7px}.issues>div{margin-top:11px;display:grid;gap:6px}.issues article{padding:9px;border-left:3px solid #b66a18;background:#fff8ed}.issues article.error{border-color:#ae4b45;background:#fff1ef}.issues article.information{border-color:#678696;background:#edf4f7}.issues strong{font-size:8px}.issues p{margin:4px 0;color:#625b50;font-size:9px}.issues code{overflow-wrap:anywhere;color:#74817c;font-size:7px}
@media(max-width:760px){.review-panel main{padding:12px}.review-metrics{grid-template-columns:repeat(2,1fr)}.review-metrics article:nth-child(2){border-right:0}.review-metrics article:nth-child(-n+2){border-bottom:1px solid #e1e7e5}.stage-list{display:grid;grid-template-columns:1fr 1fr}.stage-list>svg{display:none}.brief-summary,.result-columns{grid-template-columns:1fr}}
</style>
