import { useState } from 'react';
import { Download, Share2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface ProposalDocumentListProps {
  documents: { url: string; name: string }[];
}

function toDownloadUrl(url: string): string {
  // Inserts fl_attachment into Cloudinary URLs to force download on all devices
  // including mobile, bypassing cross-origin download restrictions.
  // Works only on Cloudinary URLs — leaves other URLs unchanged.
  if (!url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/fl_attachment/');
}

export function ProposalDocumentList({ documents }: ProposalDocumentListProps) {
  const [sharingIndex, setSharingIndex] = useState<number | null>(null);
  const { showToast } = useToast();

  if (documents.length === 0) return null;

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function handleShare(url: string, name: string, index: number) {
    setSharingIndex(index);
    try {
      // Try to share as actual file first (WhatsApp, etc. receive real PDF)
      if (navigator.canShare && navigator.share) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load document');
        const blob = await response.blob();
        const file = new File([blob], name, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          return;
        }
      }
      // Fallback: share URL if file sharing not supported
      if (navigator.share) {
        await navigator.share({ title: name, url });
      }
    } catch (err) {
      // AbortError means the user dismissed the share sheet — no toast needed
      if (!(err instanceof Error && err.name === 'AbortError')) {
        showToast('Could not share document. Try again.', 'error');
      }
    } finally {
      setSharingIndex(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {documents.map((docItem, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* View — opens in new tab */}
          <a
            href={docItem.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-sm text-blue-700 hover:underline truncate min-w-0"
          >
            {docItem.name}
          </a>

          {/* Download — forces file save via fl_attachment */}
          <a
            href={toDownloadUrl(docItem.url)}
            target="_blank"
            rel="noopener noreferrer"
            download
            title="Download"
            className="shrink-0 text-blue-500 hover:text-blue-700 transition-colors"
          >
            <Download className="h-4 w-4" />
          </a>

          {/* Share */}
          {canShare && (
            <button
              type="button"
              title="Share document"
              disabled={sharingIndex !== null}
              onClick={() => handleShare(docItem.url, docItem.name, i)}
              className="shrink-0 text-blue-500 hover:text-blue-700 transition-colors disabled:opacity-50"
            >
              {sharingIndex === i
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Share2 className="h-4 w-4" />
              }
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
