import { PageSection } from './PageSection';

export function SinglePageView({ pageId }: { pageId: string }) {
  return (
    <div class="editor">
      <div class="editor-main">
        <PageSection pageId={pageId} />
      </div>
    </div>
  );
}
