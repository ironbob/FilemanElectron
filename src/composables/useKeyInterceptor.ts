/**
 * Capture-phase keyboard interceptor with LIFO priority.
 *
 * Problem: Multiple components (`App.vue`, `PreviewTextContent`, etc.) listen
 * to `document` keydown in bubble phase. whichever registered first wins —
 * child modals cannot prevent parent handlers from firing.
 *
 * Solution:
 *   - One shared `document.addEventListener('keydown', …, true)` (capture phase)
 *     runs BEFORE any bubble-phase listener, regardless of registration order.
 *   - Handlers are executed LIFO (last registered = innermost/child component runs first).
 *   - Returning `true` from a handler marks the event as "consumed":
 *       · calls `e.stopImmediatePropagation()` → no other capture handlers run
 *       · prevents bubble phase entirely → parent bubble-phase handlers are skipped
 *
 * Usage (in a `<script setup>` component):
 *
 *   useKeyInterceptor((e) => {
 *     if (e.key === 'Escape' && myModalOpen.value) {
 *       closeModal()
 *       return true   // ← consumed; parent won't see this ESC
 *     }
 *   })
 */

import { onMounted, onUnmounted } from 'vue'

type KeyHandler = (e: KeyboardEvent) => boolean | void

const _handlers: KeyHandler[] = []

let _initialized = false
function _ensureInitialized() {
  if (_initialized) return
  _initialized = true
  document.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      // Iterate from newest (innermost) to oldest (outermost)
      for (let i = _handlers.length - 1; i >= 0; i--) {
        if (_handlers[i](e) === true) {
          // Prevent all other listeners (capture AND bubble phase) from firing
          e.stopImmediatePropagation()
          break
        }
      }
    },
    true, // capture phase
  )
}

/**
 * Register a keydown interceptor for the lifetime of the component.
 * Auto-registers on `onMounted` and auto-unregisters on `onUnmounted`.
 */
export function useKeyInterceptor(handler: KeyHandler): void {
  _ensureInitialized()
  onMounted(() => _handlers.push(handler))
  onUnmounted(() => {
    const idx = _handlers.indexOf(handler)
    if (idx !== -1) _handlers.splice(idx, 1)
  })
}
