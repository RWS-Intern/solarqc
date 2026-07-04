export function getProposalDocuments(
  data: { documents?: { url: string; name: string }[]; documentUrl?: string; documentName?: string } | null | undefined
): { url: string; name: string }[] {
  if (!data) return [];
  if (data.documents && data.documents.length > 0) return data.documents;
  if (data.documentUrl) return [{ url: data.documentUrl, name: data.documentName || 'Document' }];
  return [];
}
