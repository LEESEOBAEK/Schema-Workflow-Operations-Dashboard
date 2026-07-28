<script setup lang="ts">
import { Check, FileText, Save, X } from 'lucide-vue-next'
import type {
  ExecutionTemplateCatalog,
  ExecutionTemplateKind,
  ExecutionTemplateOption,
  ExecutionTemplateRenderResult,
  WorkflowRun,
} from '../../shared/types/dashboard'

const props = defineProps<{
  projectRoot: string
  expectedRevision: number
  runs: WorkflowRun[]
}>()

const emit = defineEmits<{
  close: []
  saved: [result: ExecutionTemplateRenderResult]
}>()

const templates = ref<ExecutionTemplateOption[]>([])
const selectedTemplateId = ref('project-start')
const title = ref('')
const situation = ref('')
const anchorRunId = ref('')
const constraints = ref('')
const preview = ref('')
const savedPath = ref('')
const loading = ref(false)
const error = ref('')

const selectedTemplate = computed(() => templates.value.find(item => item.template_id === selectedTemplateId.value))
const anchorRequired = computed(() => selectedTemplate.value?.kind !== 'project_start')
const readyToRender = computed(() => Boolean(
  selectedTemplateId.value
  && title.value.trim()
  && situation.value.trim()
  && (!anchorRequired.value || anchorRunId.value),
))

function kindLabel(kind: ExecutionTemplateKind): string {
  return {
    project_start: '시작',
    feature_change: '변경',
    maintenance_fix: '유지보수',
    completion_review: '완료',
    continuation: '이어가기',
    branch: '분기',
  }[kind]
}

function errorMessage(value: unknown): string {
  const candidate = value as { data?: { statusMessage?: string }; message?: string }
  return candidate?.data?.statusMessage ?? candidate?.message ?? '실행 템플릿을 처리하지 못했습니다.'
}

async function loadTemplates() {
  loading.value = true
  error.value = ''
  try {
    const result = await $fetch<ExecutionTemplateCatalog>('/api/execution-templates')
    templates.value = result.templates
    if (!result.templates.some(item => item.template_id === selectedTemplateId.value)) {
      selectedTemplateId.value = result.templates[0]?.template_id ?? ''
    }
  } catch (value) {
    error.value = errorMessage(value)
  } finally {
    loading.value = false
  }
}

async function render(action: 'preview' | 'save') {
  if (!selectedTemplateId.value || !title.value.trim() || !situation.value.trim() || loading.value) return
  loading.value = true
  error.value = ''
  savedPath.value = ''
  try {
    const result = await $fetch<ExecutionTemplateRenderResult>('/api/execution-templates', {
      method: 'POST',
      body: {
        action,
        project_root: props.projectRoot,
        template_id: selectedTemplateId.value,
        title: title.value,
        situation: situation.value,
        anchor_run_id: anchorRunId.value,
        constraints: constraints.value,
        expected_revision: props.expectedRevision,
      },
    })
    preview.value = result.markdown
    savedPath.value = result.output_path ?? ''
    if (result.saved && result.session_id) emit('saved', result)
  } catch (value) {
    error.value = errorMessage(value)
  } finally {
    loading.value = false
  }
}

watch(selectedTemplateId, () => {
  preview.value = ''
  savedPath.value = ''
})

onMounted(loadTemplates)
</script>

<template>
  <div class="template-backdrop" @click.self="$emit('close')">
    <section class="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-dialog-title">
      <header>
        <div>
          <small>Reusable Template → Project Execution Copy</small>
          <h2 id="template-dialog-title">작업 실행 템플릿</h2>
        </div>
        <button type="button" title="닫기" @click="$emit('close')"><X :size="18" /></button>
      </header>

      <div class="template-body">
        <aside>
          <div class="template-boundary">
            <strong>원본과 실행본을 분리합니다.</strong>
            <p>이 목록은 재사용 원본입니다. 저장하면 현재 프로젝트에만 적용되는 실행본 MD가 생성됩니다.</p>
          </div>
          <button
            v-for="template in templates"
            :key="template.template_id"
            type="button"
            :class="{ active: template.template_id === selectedTemplateId }"
            @click="selectedTemplateId = template.template_id"
          >
            <span>{{ kindLabel(template.kind) }}</span>
            <div><strong>{{ template.name }}</strong><small>{{ template.description }}</small></div>
            <Check v-if="template.template_id === selectedTemplateId" :size="15" />
          </button>
        </aside>

        <main>
          <section v-if="selectedTemplate" class="template-intro">
            <span>{{ selectedTemplate.use_when }}</span>
            <strong>{{ selectedTemplate.name }}</strong>
            <p>필수 입력: {{ selectedTemplate.required_inputs.join(' · ') }}</p>
          </section>

          <form @submit.prevent="render('preview')">
            <label><span>작업 제목</span><input v-model="title" maxlength="160" placeholder="예: 검색 기능 사용성 개선" required /></label>
            <label><span>현재 상황</span><textarea v-model="situation" rows="7" maxlength="20000" placeholder="관찰한 문제, 원하는 결과, 알고 있는 근거를 자연어로 입력하세요." required /></label>
            <label><span>기준 Run {{ anchorRequired ? '(필수)' : '(선택)' }}</span>
              <select v-model="anchorRunId" :required="anchorRequired">
                <option value="">기준 Run 없음</option>
                <option v-for="run in runs" :key="run.run_id" :value="run.run_id">{{ run.display_title || run.system_label || run.run_id }}</option>
              </select>
            </label>
            <label><span>제약조건 (선택)</span><textarea v-model="constraints" rows="3" maxlength="5000" placeholder="변경하면 안 되는 범위, 시간, 기술 또는 운영 제약" /></label>
            <p v-if="error" class="template-error">{{ error }}</p>
            <div class="template-actions">
              <button type="submit" class="preview-action" :disabled="loading || !readyToRender"><FileText :size="15" />미리보기</button>
              <button type="button" class="save-action" :disabled="loading || !readyToRender" @click="render('save')"><Save :size="15" />실행본·작업 세션 생성</button>
            </div>
          </form>

          <div v-if="savedPath" class="saved-result"><Check :size="16" /><span><strong>실행본과 작업 세션을 생성했습니다.</strong><code>{{ savedPath }}</code></span></div>
          <section v-if="preview" class="markdown-preview"><header><strong>실행본 MD 미리보기</strong><small>원본 템플릿은 변경되지 않습니다.</small></header><pre>{{ preview }}</pre></section>
        </main>
      </div>
    </section>
  </div>
</template>

<style scoped>
.template-backdrop{position:fixed;inset:0;z-index:130;display:grid;place-items:center;padding:20px;background:#17201d73;backdrop-filter:blur(2px)}
.template-dialog{width:min(1040px,100%);height:min(820px,calc(100vh - 40px));display:grid;grid-template-rows:70px minmax(0,1fr);overflow:hidden;background:#f5f8f7;border:1px solid #cbd6d2;border-radius:7px;box-shadow:0 24px 70px #10251d38;color:#1c272b}
.template-dialog>header{padding:0 20px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #dce4e1}.template-dialog>header small{color:#73807b;font-size:9px;font-weight:750}.template-dialog h2{margin:4px 0 0;font-size:18px}.template-dialog>header button{width:34px;height:34px;display:grid;place-items:center;border:1px solid #d3dcda;background:#fff;color:#52615c;border-radius:5px}
.template-body{min-height:0;display:grid;grid-template-columns:280px minmax(0,1fr)}.template-body>aside{padding:14px;overflow:auto;background:#eef3f1;border-right:1px solid #d7dfdc}.template-boundary{margin-bottom:10px;padding:11px;background:#fff;border-left:3px solid #2f7259}.template-boundary strong{font-size:10px}.template-boundary p{margin:5px 0 0;color:#65736e;font-size:8px;line-height:1.5}.template-body>aside>button{width:100%;min-height:66px;margin-top:6px;padding:9px;display:grid;grid-template-columns:42px minmax(0,1fr) 16px;align-items:center;gap:8px;text-align:left;border:1px solid #d9e1de;background:#fff;color:#26342f;border-radius:5px}.template-body>aside>button.active{border-color:#4c8a72;background:#edf7f2}.template-body>aside>button>span{padding:5px;text-align:center;color:#2b6d54;background:#e6f1ec;border-radius:4px;font-size:8px;font-weight:800}.template-body>aside>button div{min-width:0;display:grid;gap:4px}.template-body>aside>button strong{font-size:9px}.template-body>aside>button small{color:#71807a;font-size:8px;line-height:1.4}
.template-body>main{min-height:0;padding:16px 18px 24px;overflow:auto}.template-intro{padding:11px;display:grid;gap:4px;background:#fff;border:1px solid #dce4e1;border-radius:5px}.template-intro span{color:#2f7259;font-size:8px;font-weight:800}.template-intro strong{font-size:13px}.template-intro p{margin:0;color:#73807b;font-size:8px}.template-body form{margin-top:12px;display:grid;gap:11px}.template-body label{display:grid;gap:5px}.template-body label>span{font-size:9px;font-weight:800}.template-body input,.template-body textarea,.template-body select{width:100%;box-sizing:border-box;border:1px solid #cfd8d5;background:#fff;color:#1e2b27;border-radius:5px;font:11px PretendardLocal,"Segoe UI",sans-serif;outline:none}.template-body input,.template-body select{height:38px;padding:0 10px}.template-body textarea{padding:9px 10px;resize:vertical;line-height:1.5}.template-body input:focus,.template-body textarea:focus,.template-body select:focus{border-color:#47836d;box-shadow:0 0 0 3px #3c7c6420}.template-actions{display:flex;justify-content:flex-end;gap:7px}.template-actions button{height:36px;padding:0 12px;display:flex;align-items:center;gap:5px;border-radius:5px;font-size:9px;font-weight:800}.preview-action{border:1px solid #bfcfc9;background:#fff;color:#356957}.save-action{border:0;background:#1f7254;color:#fff}.template-actions button:disabled{opacity:.45}.template-error{margin:0;padding:8px;color:#9d403a;background:#fff1ef;border-radius:4px;font-size:9px}.saved-result{margin-top:12px;padding:10px;display:flex;gap:8px;color:#28664e;background:#edf7f2;border:1px solid #cfe3da;border-radius:5px}.saved-result span{min-width:0;display:grid;gap:3px}.saved-result strong{font-size:9px}.saved-result code{overflow-wrap:anywhere;font-size:8px}.markdown-preview{margin-top:12px;background:#fff;border:1px solid #dce4e1;border-radius:5px;overflow:hidden}.markdown-preview>header{padding:10px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8e6}.markdown-preview>header strong{font-size:9px}.markdown-preview>header small{color:#75827d;font-size:8px}.markdown-preview pre{max-height:360px;margin:0;padding:14px;overflow:auto;white-space:pre-wrap;color:#35443e;font:9px/1.65 "Cascadia Code",monospace}
@media(max-width:700px){.template-backdrop{padding:0}.template-dialog{width:100%;height:100%;border:0;border-radius:0}.template-body{display:block;overflow:auto}.template-body>aside{display:flex;gap:6px;overflow:auto;border-right:0;border-bottom:1px solid #d7dfdc}.template-boundary{min-width:210px;margin:0}.template-body>aside>button{min-width:190px;margin:0}.template-body>main{overflow:visible}.template-actions{display:grid;grid-template-columns:1fr 1fr}.template-actions button{justify-content:center}.markdown-preview pre{max-height:300px}}
</style>
