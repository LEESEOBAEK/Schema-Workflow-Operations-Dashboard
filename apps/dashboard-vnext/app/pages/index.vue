<script setup lang="ts">
await navigateTo('/hybrid', { redirectCode: 302, replace: true })
</script>

<template>
  <main class="route-loading" aria-live="polite">운영 화면을 여는 중입니다.</main>
</template>

<style scoped>
.route-loading{min-height:100vh;display:grid;place-items:center;background:#f3f6f5;color:#53615c;font:13px PretendardLocal,"Segoe UI",sans-serif}
</style>
