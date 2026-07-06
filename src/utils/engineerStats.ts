export function getProposalDoneCount(tasks: { pipelineStage?: string | null }[]): number {
  return tasks.filter((t) => t.pipelineStage && t.pipelineStage !== 'proposal').length;
}
