export function getProposalNoteRecipientLabel(
  submittedToStage: string | undefined,
): string {
  if (submittedToStage === 'backend') return 'Note for Backend Team';
  if (
    submittedToStage === 'field_review' ||
    submittedToStage === 'documents' ||
    submittedToStage === 'survey' ||
    !submittedToStage
  ) {
    return 'Note for Field Engineer';
  }
  return 'Note attached to this submission';
}
