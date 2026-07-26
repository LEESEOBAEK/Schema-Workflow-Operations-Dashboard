export default defineNuxtConfig({
  compatibilityDate: '2026-07-18',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    dashboardDataMode: 'mock',
    dashboardProjectRoots: '',
    dashboardMaxSourceBytes: 1048576,
    dashboardMetadataPath: '.data/dashboard-metadata.json',
    dashboardProjectCatalogPath: '.data/project-catalog.json',
    dashboardTrustedAutoRoots: '',
    dashboardTrustedAutoRegistryPath: '',
    schemaWorkflowLauncher: '',
  },
  // Run type checking as an explicit build step so Windows paths with spaces
  // are not split incorrectly by Nuxt's integrated type-check subprocess.
  typescript: { strict: true, typeCheck: false },
  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      title: 'Schema Workflow Console',
      meta: [{ name: 'description', content: '워크플로 실행과 근거 관계를 한 화면에서 검토하는 운영 콘솔' }],
    },
  },
})
