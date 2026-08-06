import { useEffect, useRef } from 'react';

// Shared across every drawer using this hook. Only one drawer is ever open
// at a time in this app, but one drawer can hand off straight into another
// in the same render (e.g. FieldReviewDrawer -> DocumentsWorkDrawer on
// Accept). Tracking a single shared "is a drawer open" entry here — instead
// of each hook instance pushing/popping its own history entry — avoids a
// race where the outgoing drawer's `history.back()` (async) ends up
// consuming the incoming drawer's freshly-pushed entry instead of its own,
// since `pushState` (sync) can land before the pending `back()` resolves.
let openDrawerCount    = 0;
let historyEntryPushed = false;

/**
 * Makes the phone back button/gesture close an open drawer instead of
 * navigating away from the page. While `isOpen` is true, pushes one dummy
 * history entry so there's something for "back" to consume; a `popstate`
 * while open calls `onClose()` instead of letting the browser navigate.
 * When the drawer closes some other way (X button, backdrop, submit), the
 * dummy entry is popped — unless another drawer claimed it in the same
 * tick — so it doesn't linger and swallow the user's next real back press.
 */
export function useDrawerBackButton(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      openDrawerCount++;
      if (!historyEntryPushed) {
        window.history.pushState({ drawer: true }, '');
        historyEntryPushed = true;
      }

      const handlePopState = () => {
        historyEntryPushed = false;
        onCloseRef.current();
      };
      window.addEventListener('popstate', handlePopState);

      // Cleanup runs both when isOpen flips to false AND when the component
      // unmounts while isOpen is still true. In both cases we must decrement
      // the counter exactly once to match the increment above.
      return () => {
        window.removeEventListener('popstate', handlePopState);
        openDrawerCount = Math.max(0, openDrawerCount - 1);
        // Defer the pop by a tick: if another drawer opens in the same batched
        // render (incrementing openDrawerCount again before this runs), skip it.
        queueMicrotask(() => {
          if (openDrawerCount === 0 && historyEntryPushed) {
            historyEntryPushed = false;
            window.history.back();
          }
        });
      };
    }
    // isOpen is false — the cleanup of the isOpen=true branch above already
    // decremented the counter and queued the microtask. Nothing to do here.
  }, [isOpen]);
}
