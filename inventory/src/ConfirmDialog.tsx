// ============================================================================
// Lattice Inventory — ConfirmDialog Component
// ============================================================================

import { useCallback } from 'preact/hooks';
import { confirmDialog } from './state';
import { ModalShell } from './ModalShell';

export function ConfirmDialog() {
  const dialog = confirmDialog.value;
  if (!dialog) return null;

  const dismiss = useCallback(() => { confirmDialog.value = null; }, []);
  const handleConfirm = useCallback(() => {
    confirmDialog.value = null;
    dialog.onConfirm();
  }, [dialog]);

  return (
    <ModalShell title={dialog.title} onClose={dismiss}>
      <div class="confirm-msg">{dialog.message}</div>
      <div class="modal-actions">
        <button class="btn" onClick={dismiss}>Cancel</button>
        <button
          class="btn btn-primary"
          style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={handleConfirm}
        >
          {dialog.confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
