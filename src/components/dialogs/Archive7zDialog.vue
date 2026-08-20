<template>
  <!-- 压缩为 7Z：包名（默认沿用 zip 规则：单选 stem / 多选 Archive）+ 可选密码
       （-mhe=on 连文件名加密）。创建走任务队列（SevenZipService → 捆绑 7zz）。 -->
  <div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/45" @click.self="emit('close')">
    <form class="finder-sheet w-[420px] flex flex-col p-5" @submit.prevent="confirm">
      <h2 class="text-base font-semibold">{{ $t('dialogs.archive7z.title') }}</h2>

      <label class="mt-4 flex flex-col gap-1.5">
        <span class="text-xs text-text-tertiary">{{ $t('dialogs.archive7z.nameLabel') }}</span>
        <div class="flex items-center gap-1.5">
          <input
            ref="nameInputRef"
            v-model="name"
            class="min-w-0 flex-1 rounded border border-border bg-bg-primary px-2 py-1.5 text-sm"
            :class="{ 'border-accent-red/60': nameError }"
            spellcheck="false"
          >
          <span class="ext-chip rounded border border-border px-2 py-1.5 text-xs text-text-tertiary">.7z</span>
        </div>
        <p v-if="nameError" class="text-xs text-accent-red">{{ $t('dialogs.archive7z.nameInvalid') }}</p>
      </label>

      <label class="mt-3 flex flex-col gap-1.5">
        <span class="text-xs text-text-tertiary">{{ $t('dialogs.archive7z.password') }}
          <span class="text-text-tertiary/70">（{{ $t('dialogs.archive7z.passwordOptional') }}）</span>
        </span>
        <div class="flex items-center gap-2">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            class="min-w-0 flex-1 rounded border border-border bg-bg-primary px-2 py-1.5 text-sm"
            spellcheck="false"
            autocomplete="off"
          >
          <button type="button" class="finder-btn-secondary !h-8 flex-shrink-0" @click="showPassword = !showPassword">
            {{ showPassword ? $t('dialogs.archive7z.hidePassword') : $t('dialogs.archive7z.showPassword') }}
          </button>
        </div>
        <p v-if="password" class="text-xs text-text-tertiary">{{ $t('dialogs.archive7z.encryptNote') }}</p>
      </label>

      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="finder-btn-secondary" @click="emit('close')">{{ $t('dialogs.archive7z.cancel') }}</button>
        <button type="submit" class="finder-btn-primary" :disabled="!!nameError">{{ $t('dialogs.archive7z.confirm') }}</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'

const props = defineProps<{ defaultName: string }>()
const emit = defineEmits<{ close: []; confirm: [payload: { name: string; password?: string }] }>()

const name = ref(props.defaultName)
const password = ref('')
const showPassword = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)

const nameError = computed(() => {
  const v = name.value.trim()
  if (!v) return 'empty'
  if (v.includes('/') || v.includes('\\') || v === '.' || v === '..') return 'invalid'
  return null
})

function confirm() {
  if (nameError.value) return
  emit('confirm', {
    name: name.value.trim(),
    password: password.value ? password.value : undefined
  })
}

// 打开即聚焦包名（macOS Sheet 惯例）
void nextTick(() => nameInputRef.value?.focus())
</script>
