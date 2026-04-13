import { useRef } from 'preact/hooks';
import { PageSection } from './PageSection';
import { useEditorScrollHide } from './editorState';

export function SinglePageView({ pageId }: { pageId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEditorScrollHide(ref);
  return (
    <div class="editor" ref={ref}>
      <div class="editor-main">
        <PageSection pageId={pageId} />
      </div>
    </div>
  );
}
