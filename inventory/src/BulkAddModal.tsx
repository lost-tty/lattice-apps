// ============================================================================
// Lattice Inventory — BulkAdd Modal Component
// ============================================================================

import { useRef, useCallback, useState } from 'preact/hooks';
import { parsePastedTable, importParsedItems, toast, items } from './state';
import type { ParsedTable } from './state';
import { allFieldKeys } from './engine';
import { ModalShell } from './ModalShell';

export function BulkAddModal({ onClose }: { onClose: () => void }) {
  const [parsed, setParsed] = useState<ParsedTable | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleParse = useCallback(() => {
    const text = textareaRef.current?.value || '';
    const result = parsePastedTable(text);
    if (!result || result.rows.length === 0) {
      toast('Could not parse table. Need a header row and at least one data row.', true);
      return;
    }
    setParsed(result);
  }, []);

  return (
    <ModalShell title="Bulk Add" onClose={onClose} className="bulk-modal">
      {parsed ? (
        <BulkPreview parsed={parsed} onClose={onClose} onBack={() => setParsed(null)} />
      ) : (
        <div class="bulk-paste-phase">
          <div class="bulk-hint">
            Paste a table from Numbers, Excel, or Google Sheets. First row = column headers (used as field names).
          </div>
          <textarea
            ref={(el) => { if (el) { textareaRef.current = el; el.focus(); } }}
            class="bulk-textarea"
            placeholder={'Name\tManufacturer\tPrice\nMarbles\tMutable Instruments\t350'}
            rows={10}
          />
          <button class="btn btn-primary" style={{ marginTop: '12px' }} onClick={handleParse}>
            Parse
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function matchExistingKey(header: string, existingKeys: string[]): string {
  const lower = header.trim().toLowerCase();
  const exact = existingKeys.find(k => k === header.trim());
  if (exact) return exact;
  const ci = existingKeys.find(k => k.toLowerCase() === lower);
  if (ci) return ci;
  const normalized = lower.replace(/[_\s]+/g, ' ');
  const norm = existingKeys.find(k => k.toLowerCase().replace(/[_\s]+/g, ' ') === normalized);
  if (norm) return norm;
  return header.trim();
}

function BulkPreview({ parsed, onClose, onBack }: {
  parsed: ParsedTable;
  onClose: () => void;
  onBack: () => void;
}) {
  const existingKeys = allFieldKeys([...items.value.values()]);
  const [keyValues, setKeyValues] = useState<string[]>(() =>
    parsed.headers.map(h => matchExistingKey(h, existingKeys))
  );
  const [skipFlags, setSkipFlags] = useState<boolean[]>(parsed.headers.map(() => false));

  const handleImport = useCallback(async () => {
    const finalKeys = keyValues.map((val, i) => skipFlags[i] ? null : (val.trim() || null));
    if (finalKeys.every(k => k === null)) {
      toast('At least one column must be included', true);
      return;
    }
    const count = await importParsedItems(parsed, finalKeys);
    onClose();
    toast(`Imported ${count} items`);
  }, [parsed, keyValues, skipFlags, onClose]);

  return (
    <>
      <div class="bulk-section-label">
        Column mapping ({parsed.headers.length} columns, {parsed.rows.length} rows)
      </div>
      <div class="bulk-map-table">
        {parsed.headers.map((header, i) => (
          <div class="bulk-map-row" key={i}>
            <span class="bulk-map-orig">{header || `(column ${i + 1})`}</span>
            <span class="bulk-map-arrow">{'\u2192'}</span>
            <input
              class={`bulk-map-key${keyValues[i] !== header.trim() ? ' bulk-map-matched' : ''}`}
              type="text"
              value={keyValues[i]}
              placeholder="field name"
              list="bulk-existing-keys"
              onInput={(e) => {
                const nk = [...keyValues]; nk[i] = (e.target as HTMLInputElement).value; setKeyValues(nk);
              }}
            />
            <label class="bulk-map-skip">
              <input type="checkbox" checked={skipFlags[i]}
                onChange={(e) => { const nf = [...skipFlags]; nf[i] = (e.target as HTMLInputElement).checked; setSkipFlags(nf); }}
              /> skip
            </label>
          </div>
        ))}
      </div>
      <datalist id="bulk-existing-keys">
        {existingKeys.map(k => <option key={k} value={k} />)}
      </datalist>
      <div class="bulk-section-label">Preview</div>
      <div class="bulk-preview-scroll">
        <table class="data-table bulk-preview-table">
          <thead><tr>{parsed.headers.map((_, i) => <th key={i}>{keyValues[i] || parsed.headers[i]}</th>)}</tr></thead>
          <tbody>{parsed.rows.slice(0, 5).map((row, ri) => <tr key={ri}>{row.map((c, ci) => <td key={ci}>{c}</td>)}</tr>)}</tbody>
        </table>
        {parsed.rows.length > 5 && <div class="bulk-more">... and {parsed.rows.length - 5} more rows</div>}
      </div>
      <div class="modal-actions">
        <button class="btn" onClick={onBack}>Back</button>
        <button class="btn btn-primary" onClick={handleImport}>Import {parsed.rows.length} items</button>
      </div>
    </>
  );
}
