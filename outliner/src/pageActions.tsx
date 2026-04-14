// Page-level toolbar actions shared by the inline `<PageSection>` toolbar
// and the mobile topbar toolbar rendered in `<App>`. Both surfaces call
// `buildPageToolbarGroups(pageId)` and get the same items, reading all
// state directly from global signals — no publish/subscribe registry.

import type { ToolbarGroup } from '@ui';
import { pageTitle } from './db';
import { canUndo, canRedo, undo, redo } from './undo';
import { exportPage } from './importExport';
import { debugPanels, type DebugPanelKind } from './editorState';
import {
  IconCopy, IconDownload, IconCode, IconTree, IconUndo, IconRedo,
} from './Icons';

export function debugPanelFor(pageId: string): DebugPanelKind {
  return debugPanels.value[pageId] ?? 'off';
}

export function toggleDebugPanel(pageId: string, panel: 'markdown' | 'ast') {
  const current = debugPanelFor(pageId);
  const next: DebugPanelKind = current === panel ? 'off' : panel;
  debugPanels.value = { ...debugPanels.value, [pageId]: next };
}

function copyPageMarkdown(pageId: string) {
  navigator.clipboard.writeText(exportPage(pageId));
}

function downloadPageMarkdown(pageId: string) {
  const md = exportPage(pageId);
  const title = pageTitle(pageId);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Toolbar groups for the given page. Both the inline and topbar toolbars
 *  call this; since the state they read (undo/redo availability, debug
 *  panel) is all signal-backed, the items stay in sync without a registry. */
export function buildPageToolbarGroups(pageId: string): ToolbarGroup[] {
  const panel = debugPanelFor(pageId);
  return [
    [
      { label: 'Undo (⌘Z)', icon: <IconUndo />, disabled: !canUndo(), onAction: () => undo() },
      { label: 'Redo (⌘⇧Z)', icon: <IconRedo />, disabled: !canRedo(), onAction: () => redo() },
    ],
    [
      { label: 'Debug Markdown', icon: <IconCode />, active: panel === 'markdown', onAction: () => toggleDebugPanel(pageId, 'markdown') },
      { label: 'Debug AST', icon: <IconTree />, active: panel === 'ast', onAction: () => toggleDebugPanel(pageId, 'ast') },
    ],
    [
      { label: 'Copy as Markdown', icon: <IconCopy />, onAction: () => copyPageMarkdown(pageId) },
      { label: 'Download page as Markdown', icon: <IconDownload />, onAction: () => downloadPageMarkdown(pageId) },
    ],
  ];
}
