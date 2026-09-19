import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const EVENT = 'cph:preview-pdf';

/**
 * Shows a PDF inside the app — no new tab, no download. Any component can
 * call this after fetching a PDF blob; `PdfPreviewHost` (mounted once in the
 * app layout) renders the viewer.
 *
 * @param {{blob: Blob, filename?: string, title?: string}} params
 */
export function showPdfPreview({ blob, filename, title }) {
  const file = blob instanceof Blob ? blob : new Blob([blob], { type: 'application/pdf' });
  const pdf = file.type === 'application/pdf' ? file : new Blob([file], { type: 'application/pdf' });
  window.dispatchEvent(
    new CustomEvent(EVENT, {
      detail: { url: URL.createObjectURL(pdf), blob: pdf, filename: filename || 'document.pdf', title: title || filename || 'PDF' },
    })
  );
}

/** Saves the previewed file only when the user asks for it. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The single in-app PDF viewer. Mount once, inside the authenticated layout. */
export function PdfPreviewHost() {
  const [doc, setDoc] = useState(null);

  useEffect(() => {
    function onPreview(e) {
      setDoc((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return e.detail;
      });
    }
    window.addEventListener(EVENT, onPreview);
    return () => window.removeEventListener(EVENT, onPreview);
  }, []);

  function close() {
    setDoc((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  return (
    <Dialog open={Boolean(doc)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex h-[92vh] w-[min(96vw,70rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3 pr-12 text-left">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">{doc?.title}</DialogTitle>
            <DialogDescription className="truncate text-xs">{doc?.filename}</DialogDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => doc && downloadBlob(doc.blob, doc.filename)}
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
        </DialogHeader>
        {doc ? (
          <iframe
            key={doc.url}
            title={doc.title}
            src={`${doc.url}#toolbar=1&navpanes=0`}
            className="h-full w-full flex-1 bg-muted"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default PdfPreviewHost;
