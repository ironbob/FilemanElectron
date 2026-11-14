<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseSheet from './BaseSheet.vue'

/**
 * 压缩为 7Z（Sheet v2）：包名（默认沿用 zip 规则）+ 可选密码（-mhe=on 连文件名加密）。
 * 创建走任务队列（SevenZipService → 捆绑 7zz），逻辑全留父层。
 */
const props = defineProps<{ defaultName: string }>()
const emit = defineEmits<{ close: []; confirm: [payload: { name: string; password?: string }] }>()

const name = ref(props.defaultName)
const password = ref('')
const showPassword = ref(false)

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
</script>

<template>
  <BaseSheet
    :title="$t('dialogs.archive7z.title')"
    glyph="archive"
    tone="var(--accent-orange)"
    :width="440"
    as="form"
    @close="emit('close')"
    @submit="confirm"
  >
    <div class="flex flex-col gap-3">
      <label class="block">
        <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.archive7z.nameLabel') }}</span>
        <div class="flex items-center gap-1.5">
          <input
            v-model="name"
            data-autofocus
            class="sheet-name-input min-w-0 flex-1"
            :class="{ 'is-invalid': nameError }"
            spellcheck="false"
          >
          <span class="rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-tertiary">.7z</span>
        </div>
        <p v-if="nameError" class="mt-1 text-xs text-accent-red">{{ $t('dialogs.archive7z.nameInvalid') }}</p>
      </label>

      <label class="block">
        <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.archive7z.password') }}
          <span class="text-text-tertiary">（{{ $t('dialogs.archive7z.passwordOptional') }}）</span>
        </span>
        <div class="flex items-center gap-2">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            class="sheet-name-input min-w-0 flex-1"
            spellcheck="false"
            autocomplete="off"
          >
          <button type="button" class="finder-btn-secondary flex-shrink-0" @click="showPassword = !showPassword">
            {{ showPassword ? $t('dialogs.archive7z.hidePassword') : $t('dialogs.archive7z.showPassword') }}
          </button>
        </div>
        <p v-if="password" class="mt-1 text-xs text-text-tertiary">{{ $t('dialogs.archive7z.encryptNote') }}</p>
      </label>
    </div>
    <template #footer>
      <button type="button" class="finder-btn-secondary" @click="emit('close')">{{ $t('dialogs.archive7z.cancel') }}</button>
      <button type="submit" class="finder-btn-primary" :disabled="!!nameError">{{ $t('dialogs.archive7z.confirm') }}</button>
    </template>
  </BaseSheet>
</template>