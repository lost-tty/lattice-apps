// ============================================================================
// Lattice Inventory — Modal Components
// ============================================================================

import { useRef, useCallback, useState } from 'preact/hooks';
import type { GroupIndex } from './types';
import { ID } from './types';
import {
  items, groupLevels, collapsed, index, focusedId, editing,
  uuid, toast, saveField, rebuildIndex, getDataStore, persistPrefs,
  declaredColumns, expandGroupsForItem,
} from './state';
import { ModalShell } from './ModalShell';

// --- New Item Modal ---

export function NewItemModal({ onClose }: { onClose: () => void }) {
  const [fields, setFields] = useState<{ key: string; value: string }[]>([
    { key: '', value: '' },
  ]);

  const groupFields = groupLevels.value.map(levelKey => {
    const allItems = [...items.value.values()];
    const existing = [...new Set(allItems.map(it => String(it[levelKey] ?? '')).filter(Boolean))].sort();
    let defaultVal = '';
    const expanded = index.value.find(g => g.group !== '__all__' && !collapsed.value.has(g.path));
    if (expanded) defaultVal = expanded.group;
    return { key: levelKey, existing, defaultVal };
  });

  const groupInputRefs = useRef<HTMLInputElement[]>([]);

  const handleCreate = useCallback(async () => {
    const newId = uuid();
    const item = { [ID]: newId } as any;
    const ds = getDataStore();

    for (const f of fields) {
      const key = f.key.trim();
      const val = f.value.trim();
      if (key && val) item[key] = val;
    }

    for (let i = 0; i < groupLevels.value.length; i++) {
      const key = groupLevels.value[i];
      const val = groupInputRefs.current[i]?.value.trim();
      if (val) item[key] = val;
    }

    if (Object.keys(item).length === 0) {
      toast('Add at least one field', true);
      return;
    }

    await ds.save(newId, item);
    onClose();
    focusedId.value = newId;
    editing.value = null;
    expandGroupsForItem(item);
    rebuildIndex();
    toast('Item created');
  }, [onClose, fields]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
  }, [handleCreate]);

  return (
    <ModalShell title="New item" onClose={onClose}>
      {groupFields.map((gf, i) => (
        <div class="modal-field" key={gf.key}>
          <label class="modal-label">{gf.key}</label>
          <input
            ref={(el) => { if (el) groupInputRefs.current[i] = el; }}
            class="modal-input"
            type="text"
            placeholder={gf.key}
            value={gf.defaultVal}
            list={gf.existing.length > 0 ? `new-grp-${i}` : undefined}
            onKeyDown={handleKeyDown}
          />
          {gf.existing.length > 0 && (
            <datalist id={`new-grp-${i}`}>
              {gf.existing.map(val => <option key={val} value={val} />)}
            </datalist>
          )}
        </div>
      ))}

      {fields.map((f, i) => (
        <div class="modal-field modal-field-pair" key={i}>
          <input
            class="modal-input modal-input-key"
            type="text"
            placeholder="Field name"
            value={f.key}
            onInput={(e) => {
              const nf = [...fields];
              nf[i] = { ...nf[i], key: (e.target as HTMLInputElement).value };
              setFields(nf);
            }}
            onKeyDown={handleKeyDown}
            ref={i === 0 ? (el: HTMLInputElement | null) => el?.focus() : undefined}
          />
          <input
            class="modal-input modal-input-value"
            type="text"
            placeholder="Value"
            value={f.value}
            onInput={(e) => {
              const nf = [...fields];
              nf[i] = { ...nf[i], value: (e.target as HTMLInputElement).value };
              setFields(nf);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
      ))}

      <button class="btn btn-sm" style={{ marginTop: '4px' }} onClick={() => setFields([...fields, { key: '', value: '' }])}>+ Field</button>

      <div class="modal-actions">
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn btn-primary" onClick={handleCreate}>Create</button>
      </div>
    </ModalShell>
  );
}

// --- Add Column Modal ---

export function AddColumnModal({ grp, onClose }: { grp: GroupIndex; onClose: () => void }) {
  const nameRef = useRef<HTMLInputElement>(null);
  const valRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(async () => {
    const rawKey = nameRef.current?.value.trim() || '';
    if (!rawKey) { nameRef.current?.focus(); return; }

    const defaultVal = valRef.current?.value.trim() || '';
    onClose();

    if (!declaredColumns.value.includes(rawKey)) {
      declaredColumns.value = [...declaredColumns.value, rawKey];
    }

    if (defaultVal) {
      const isNum = /^-?\d+([.,]\d+)?$/.test(defaultVal);
      for (const item of grp.items) {
        await saveField(item[ID], rawKey, defaultVal, isNum);
      }
      toast(`Added "${rawKey}" to ${grp.items.length} items`);
    } else {
      toast(`Added column "${rawKey}"`);
    }

    rebuildIndex();
    persistPrefs();
  }, [grp, onClose]);

  return (
    <ModalShell title="Add column" onClose={onClose}>
      <div class="modal-field">
        <label class="modal-label">Field name</label>
        <input
          ref={(el) => { if (el) { nameRef.current = el; el.focus(); } }}
          class="modal-input"
          type="text"
          placeholder="e.g. Manufacturer, Price, Notes"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
      </div>
      <div class="modal-field">
        <label class="modal-label">Default value (optional)</label>
        <input
          ref={valRef}
          class="modal-input"
          type="text"
          placeholder="Leave empty to add column without values"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
      </div>
      <div class="modal-actions">
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn btn-primary" onClick={handleAdd}>Add</button>
      </div>
    </ModalShell>
  );
}
