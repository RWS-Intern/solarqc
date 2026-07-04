import { Download } from 'lucide-react';

interface ProposalDocumentListProps {
  documents: { url: string; name: string }[];
}

export function ProposalDocumentList({ documents }: ProposalDocumentListProps) {
  if (documents.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {documents.map((docItem, i) => (
        <a
          key={i}
          href={docItem.url}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline"
        >
          <Download className="h-4 w-4" />
          {docItem.name}
        </a>
      ))}
    </div>
  );
}
