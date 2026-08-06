import {
  doc, updateDoc,
  serverTimestamp, arrayUnion, Timestamp, increment,
  runTransaction,
} from 'firebase/firestore';
import { db }           from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useToast }     from '@/components/ui/toast';
import { assignLeastLoaded } from '@/utils/findLeastLoadedUser';
import { getProposalDocuments } from '@/utils/proposalDocuments';
import { computePriorityScore } from '@/utils/taskScoring';
import { logError } from '@/utils/logError';
import { computeSaleClosedEvidence } from '@/utils/computeSaleClosed';
import type { Task, PipelineStage, ProposalStageData, JourneyStepDefinition, JourneyStepAnswer, RemarkEntry } from '@/types';

function cleanStep(step: JourneyStepAnswer): Record<string, unknown> {
  const base: Record<string, unknown> = {
    stepId:     step.stepId,
    label:      step.label,
    type:       step.type,
    status:     step.status,
    realDate:   step.realDate   ?? null,
    photoUrls:  step.photoUrls  ?? [],
    recordedAt: step.recordedAt ?? null,
    recordedBy: step.recordedBy ?? '',
  };
  if (step.inputValue !== undefined) {
    base['inputValue'] = step.inputValue;
  }
  if (step.remarks !== undefined) {
    base['remarks'] = step.remarks;
  }
  return base;
}

export function resolveCorrectionReturn(
  taskData:        Record<string, unknown>,
  normalNextStage: PipelineStage,
): {
  targetStage:          PipelineStage;
  isReturning:          boolean;
  returnAssignedTo:     string | null;
  returnAssignedToName: string;
} {
  const returnTo = taskData['correctionReturnTo'] as PipelineStage | null | undefined;
  if (!returnTo) {
    return { targetStage: normalNextStage, isReturning: false, returnAssignedTo: null, returnAssignedToName: '' };
  }
  return {
    targetStage:          returnTo,
    isReturning:          true,
    returnAssignedTo:     (taskData['correctionReturnAssignedTo']     as string | null) ?? null,
    returnAssignedToName: (taskData['correctionReturnAssignedToName'] as string)        ?? '',
  };
}

export function usePipelineActions() {
  const { currentUser } = useAuthStore();
  const { showToast }   = useToast();

  // ── Submit Proposal (proposal → field_review) ──────────────────
  async function submitProposal(
    taskId:    string,
    documents: { url: string; name: string }[],
    note?:     string,
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');

    const taskRef          = doc(db, 'tasks', taskId);
    const proposalStageRef = doc(db, 'tasks', taskId, 'stages', 'proposal');

    let proposalAssignedTo:      string | null = null;
    let proposalTargetStage:     PipelineStage = 'field_review';
    let proposalIsReturning                    = false;
    let proposalReturnAssignedTo:     string | null = null;
    let proposalReturnAssignedToName              = '';

    try {
      await runTransaction(db, async (tx) => {
        // Optimistic-lock: abort if this task is no longer in the 'proposal'
        // stage (i.e. a concurrent submit already advanced it).
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        const currentStage = taskSnap.data()['pipelineStage'] as string;
        if (currentStage !== 'proposal') {
          throw new Error(
            'This proposal was already submitted by someone else. Please refresh and check the task status.',
          );
        }

        proposalAssignedTo = taskSnap.data()['proposalAssignedTo'] as string | null;

        const corrResult = resolveCorrectionReturn(taskSnap.data() as Record<string, unknown>, 'field_review');
        proposalTargetStage          = corrResult.targetStage;
        proposalIsReturning          = corrResult.isReturning;
        proposalReturnAssignedTo     = corrResult.returnAssignedTo;
        proposalReturnAssignedToName = corrResult.returnAssignedToName;

        // Stage history entry uses a client timestamp — serverTimestamp() cannot
        // be used inside arrayUnion.
        const stageHistoryEntry = {
          fromStage: 'proposal' as const,
          toStage:   proposalTargetStage,
          timestamp: Timestamp.now(),
          actorUid:  currentUser.uid,
          actorName: currentUser.name,
          actorRole: 'proposal',
          note:      '',
        };

        // Read existing proposal stage doc inside the transaction for a
        // consistent, locked revisions snapshot.
        const existingSnap = await tx.get(proposalStageRef);
        const revisions: ProposalStageData['revisions'] = [];

        if (existingSnap.exists()) {
          const existing = existingSnap.data() as ProposalStageData;
          const existingDocuments = getProposalDocuments(existing);
          // Move current proposal to revisions before overwriting — works whether
          // the existing stage doc is old-shape (documentUrl only) or new-shape
          // (documents array), since getProposalDocuments() normalizes both.
          if (existingDocuments.length > 0) {
            revisions.push(...(existing.revisions ?? []), {
              documentUrl:     existingDocuments[0].url,
              documentName:    existingDocuments[0].name,
              uploadedAt:      (existing.uploadedAt as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date(),
              uploadedBy:      existing.uploadedBy ?? '',
              uploadedByName:  existing.uploadedByName ?? '',
              revisionNote:    existing.proposalNote ?? '',
              documents:       existingDocuments,
              submittedToStage: existing.submittedToStage ?? 'field_review',
            });
          }
        }

        // Write stages/proposal document. documentUrl/documentName mirror
        // documents[0] (dual-write) so any screen not yet updated to read
        // `documents` keeps seeing the first uploaded file exactly as before.
        tx.set(proposalStageRef, {
          documentUrl:      documents[0].url,
          documentName:     documents[0].name,
          documents,
          uploadedAt:       serverTimestamp(),
          uploadedBy:       currentUser.uid,
          uploadedByName:   currentUser.name,
          revisions,
          proposalNote:     note?.trim() ?? '',
          submittedToStage: proposalTargetStage,
        });

        const proposalTaskUpdate: Record<string, unknown> = {
          pipelineStage:         proposalTargetStage,
          priorityScore:         computePriorityScore(proposalTargetStage, 'completed'),
          proposalRevisionCount: revisions.length,
          stageHistory:          arrayUnion(stageHistoryEntry),
          updatedAt:             serverTimestamp(),
        };

        if (proposalIsReturning) {
          proposalTaskUpdate['correctionReturnTo']             = null;
          proposalTaskUpdate['correctionReturnAssignedTo']     = null;
          proposalTaskUpdate['correctionReturnAssignedToName'] = '';
          proposalTaskUpdate['correctionNote']                 = '';
          proposalTaskUpdate['correctionSetAt']                = null;
          if (proposalReturnAssignedTo) {
            if (proposalTargetStage === 'backend') {
              proposalTaskUpdate['backendAssignedTo']     = proposalReturnAssignedTo;
              proposalTaskUpdate['backendAssignedToName'] = proposalReturnAssignedToName;
            }
          }
        }

        tx.update(taskRef, proposalTaskUpdate);

        const appConfigUpdate: Record<string, unknown> = {
          'pipelineCounts.proposal':                    increment(-1),
          [`pipelineCounts.${proposalTargetStage}`]:    increment(1),
        };
        if (proposalAssignedTo) {
          appConfigUpdate[`memberCounts.${proposalAssignedTo}`] = increment(-1);
        }
        if (proposalIsReturning) {
          if (proposalReturnAssignedTo) {
            appConfigUpdate[`memberCounts.${proposalReturnAssignedTo}`] = increment(1);
          } else if (proposalTargetStage === 'backend') {
            appConfigUpdate['pipelineCounts.unassigned_backend'] = increment(1);
          }
        }
        if (['completed', 'dropped'].includes(proposalTargetStage as string)) {
          appConfigUpdate['pipelineCounts.total_active'] = increment(-1);
        }
        tx.update(doc(db, 'appConfig', 'global'), appConfigUpdate);
      });

      if (proposalIsReturning && (proposalTargetStage as string) === 'backend' && !proposalReturnAssignedTo) {
        try {
          const assigned = await assignLeastLoaded(taskId, 'backend', 'backendAssignedTo', 'backendAssignedToName');
          if (assigned) {
            await updateDoc(doc(db, 'appConfig', 'global'), {
              'pipelineCounts.unassigned_backend': increment(-1),
            }).catch(console.error);
          }
        } catch (assignErr) {
          console.error('[submitProposal] auto-assign backend on correction-return failed:', assignErr);
        }
      }

      showToast(
        proposalIsReturning
          ? `Proposal submitted. Correction resolved — task returned to ${proposalTargetStage.replace('_', ' ')}.`
          : `Proposal submitted. Task moved to ${proposalTargetStage.replace('_', ' ')}.`,
        'success',
      );
    } catch (err) {
      console.error('[submitProposal] failed:', err);
      void logError('pipeline.submitProposal', err, { taskId });
      const alreadySubmitted = err instanceof Error &&
        err.message.startsWith('This proposal was already submitted');
      showToast(
        alreadySubmitted ? err.message : 'Failed to submit proposal. Try again.',
        'error',
      );
      throw err;
    }
  }

  // ── Assign pipeline stage team member (admin only) ─────────────
  async function assignStageTeamMember(
    taskId:       string,
    stage:        'proposal' | 'backend',
    assigneeUid:  string,
    assigneeName: string,
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');

    const fieldMap = {
      proposal: { uidField: 'proposalAssignedTo', nameField: 'proposalAssignedToName' },
      backend:  { uidField: 'backendAssignedTo',  nameField: 'backendAssignedToName'  },
    };

    const { uidField, nameField } = fieldMap[stage];

    try {
      const taskRef      = doc(db, 'tasks', taskId);
      const appConfigRef = doc(db, 'appConfig', 'global');

      await runTransaction(db, async (tx) => {
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        const oldUid = taskSnap.data()[uidField] as string | null;

        tx.update(taskRef, {
          [uidField]:  assigneeUid || null,
          [nameField]: assigneeName,
          updatedAt:   serverTimestamp(),
        });

        if (stage === 'proposal' || stage === 'backend') {
          const updates: Record<string, unknown> = {};

          if (oldUid && oldUid !== assigneeUid) {
            updates[`memberCounts.${oldUid}`] = increment(-1);
          }
          if (assigneeUid && assigneeUid !== oldUid) {
            updates[`memberCounts.${assigneeUid}`] = increment(1);
          }
          const pcUpdates: Record<string, unknown> = {};
          const countField = stage === 'proposal'
            ? 'pipelineCounts.unassigned_proposal'
            : 'pipelineCounts.unassigned_backend';

          if (!oldUid && assigneeUid) {
            pcUpdates[countField] = increment(-1);
          } else if (oldUid && !assigneeUid) {
            pcUpdates[countField] = increment(1);
          }

          const allConfigUpdates = {
            ...updates,
            ...pcUpdates,
          };
          if (Object.keys(allConfigUpdates).length > 0) {
            tx.update(appConfigRef, allConfigUpdates);
          }
        }
      });

      showToast(assigneeUid ? `Assigned to ${assigneeName}` : 'Unassigned', 'success');
    } catch (err) {
      console.error('[assignStageTeamMember] failed:', err);
      showToast('Failed to assign. Try again.', 'error');
      throw err;
    }
  }

  // ── Field Review Decision (field_review → backend/dropped/proposal) ──
  async function submitFieldReviewDecision(
    taskId:       string,
    decision:     'accepted' | 'rejected' | 'revision',
    revisionNote: string,
    _taskData:     {
      fieldAnswers:  Task['fieldAnswers'];
      fieldPhotos:   Task['fieldPhotos'];
      location:      Task['location'];
      fields:        Task['fields'];
      submittedAt:   Date | null;
    },
  ): Promise<'documents' | 'backend' | undefined> {
    if (!currentUser) throw new Error('Not authenticated');

    const taskRef          = doc(db, 'tasks', taskId);
    const fieldReviewRef   = doc(db, 'tasks', taskId, 'stages', 'field_review');

    try {
      if (decision === 'accepted') {
        const appConfigRef = doc(db, 'appConfig', 'global');

        const txResult = await runTransaction(db, async (tx): Promise<{ stage: 'documents' | 'backend'; isReturning: boolean; returnAssignedTo: string | null }> => {
          const [taskSnap, configSnap] = await Promise.all([
            tx.get(taskRef),
            tx.get(appConfigRef),
          ]);
          if (!taskSnap.exists()) throw new Error('Task not found');

          // Skip the Documents stage entirely if the admin hasn't configured
          // any document fields — nothing for the field engineer to fill in.
          const documentTemplate = (configSnap.data()?.['documentTemplate'] ?? []) as unknown[];
          const normalNextStage: 'documents' | 'backend' = documentTemplate.length > 0 ? 'documents' : 'backend';

          const {
            targetStage:          frTargetStage,
            isReturning:          frIsReturning,
            returnAssignedTo:     frReturnAssignedTo,
            returnAssignedToName: frReturnAssignedToName,
          } = resolveCorrectionReturn(taskSnap.data() as Record<string, unknown>, normalNextStage);

          const targetStage = frTargetStage as 'documents' | 'backend';

          const existingHistory = (taskSnap.data()?.['stageHistory'] ?? []) as Array<Record<string, unknown>>;
          const cappedHistory = existingHistory.slice(-49).map((e) => ({
            fromStage: e['fromStage'] ?? null,
            toStage:   e['toStage']   ?? '',
            timestamp: e['timestamp'] ?? Timestamp.now(),
            actorUid:  e['actorUid']  ?? '',
            actorName: e['actorName'] ?? '',
            actorRole: e['actorRole'] ?? '',
            note:      e['note']      ?? '',
          }));

          const entry = {
            fromStage: 'field_review' as const,
            toStage:   targetStage,
            timestamp: Timestamp.now(),
            actorUid:  currentUser.uid,
            actorName: currentUser.name,
            actorRole: 'field',
            note:      '',
          };

          tx.set(fieldReviewRef, {
            decision:      'accepted',
            decidedAt:     serverTimestamp(),
            decidedBy:     currentUser.uid,
            decidedByName: currentUser.name,
            revisionNote:  '',
          });

          const frTaskUpdate: Record<string, unknown> = {
            pipelineStage: targetStage,
            priorityScore: computePriorityScore(targetStage, 'pending'),
            stageHistory:  [...cappedHistory, entry],
            updatedAt:     serverTimestamp(),
          };

          if (frIsReturning) {
            frTaskUpdate['correctionReturnTo']             = null;
            frTaskUpdate['correctionReturnAssignedTo']     = null;
            frTaskUpdate['correctionReturnAssignedToName'] = '';
            frTaskUpdate['correctionNote']                 = '';
            frTaskUpdate['correctionSetAt']                = null;
            if (frReturnAssignedTo && targetStage === 'backend') {
              frTaskUpdate['backendAssignedTo']     = frReturnAssignedTo;
              frTaskUpdate['backendAssignedToName'] = frReturnAssignedToName;
            }
          }

          tx.update(taskRef, frTaskUpdate);

          const frConfigUpdate: Record<string, unknown> = {
            'pipelineCounts.field_review': increment(-1),
            [`pipelineCounts.${targetStage}`]: increment(1),
          };
          if (targetStage === 'backend') {
            if (frIsReturning && frReturnAssignedTo) {
              frConfigUpdate[`memberCounts.${frReturnAssignedTo}`] = increment(1);
            } else if (!frIsReturning || !frReturnAssignedTo) {
              frConfigUpdate['pipelineCounts.unassigned_backend'] = increment(1);
            }
          }
          if (['completed', 'dropped'].includes(targetStage as string)) {
            frConfigUpdate['pipelineCounts.total_active'] = increment(-1);
          }
          tx.update(appConfigRef, frConfigUpdate);

          return { stage: targetStage, isReturning: frIsReturning, returnAssignedTo: frReturnAssignedTo };
        });

        const { stage: targetStage, isReturning: frTxIsReturning, returnAssignedTo: frTxReturnAssignedTo } = txResult;

        if (targetStage === 'backend' && !(frTxIsReturning && frTxReturnAssignedTo)) {
          try {
            const assigned = await assignLeastLoaded(
              taskId,
              'backend',
              'backendAssignedTo',
              'backendAssignedToName',
            );
            if (assigned) {
              await updateDoc(appConfigRef, {
                'pipelineCounts.unassigned_backend': increment(-1),
              }).catch(console.error);
            }
          } catch (assignErr) {
            console.error('[Pipeline] auto-assign backend failed:', assignErr);
          }
        }

        showToast(
          frTxIsReturning
            ? `Proposal accepted. Correction resolved — task returned to ${targetStage.replace('_', ' ')}.`
            : targetStage === 'documents'
              ? 'Proposal accepted. Task moved to Documents.'
              : 'Proposal accepted. Task moved to Backend.',
          'success',
        );

        return targetStage;

      } else if (decision === 'rejected') {
        await runTransaction(db, async (tx) => {
          const taskSnap = await tx.get(taskRef);
          if (!taskSnap.exists()) throw new Error('Task not found');

          const existingHistory = (taskSnap.data()?.['stageHistory'] ?? []) as Array<Record<string, unknown>>;
          const cappedHistory = existingHistory.slice(-49).map((e) => ({
            fromStage: e['fromStage'] ?? null,
            toStage:   e['toStage']   ?? '',
            timestamp: e['timestamp'] ?? Timestamp.now(),
            actorUid:  e['actorUid']  ?? '',
            actorName: e['actorName'] ?? '',
            actorRole: e['actorRole'] ?? '',
            note:      e['note']      ?? '',
          }));

          const entry = {
            fromStage: 'field_review' as const,
            toStage:   'dropped' as const,
            timestamp: Timestamp.now(),
            actorUid:  currentUser.uid,
            actorName: currentUser.name,
            actorRole: 'field',
            note:      revisionNote ?? '',
          };

          tx.set(fieldReviewRef, {
            decision:      'rejected',
            decidedAt:     serverTimestamp(),
            decidedBy:     currentUser.uid,
            decidedByName: currentUser.name,
            revisionNote:  revisionNote ?? '',
          });

          tx.update(taskRef, {
            pipelineStage:                 'dropped',
            priorityScore:                 computePriorityScore('dropped', 'completed'),
            droppedReason:                 revisionNote ?? 'Consumer rejected proposal',
            stageHistory:                  [...cappedHistory, entry],
            updatedAt:                     serverTimestamp(),
            correctionReturnTo:            null,
            correctionReturnAssignedTo:    null,
            correctionReturnAssignedToName:'',
            correctionNote:                '',
            correctionSetAt:               null,
          });

          tx.update(doc(db, 'appConfig', 'global'), {
            'pipelineCounts.field_review':  increment(-1),
            'pipelineCounts.dropped':       increment(1),
            'pipelineCounts.total_active':  increment(-1),
          });
        });

        showToast('Proposal rejected. Task marked as dropped.', 'success');

      } else if (decision === 'revision') {
        await runTransaction(db, async (tx) => {
          const taskSnap = await tx.get(taskRef);
          if (!taskSnap.exists()) throw new Error('Task not found');

          const existingHistory = (taskSnap.data()?.['stageHistory'] ?? []) as Array<Record<string, unknown>>;
          const cappedHistory = existingHistory.slice(-49).map((e) => ({
            fromStage: e['fromStage'] ?? null,
            toStage:   e['toStage']   ?? '',
            timestamp: e['timestamp'] ?? Timestamp.now(),
            actorUid:  e['actorUid']  ?? '',
            actorName: e['actorName'] ?? '',
            actorRole: e['actorRole'] ?? '',
            note:      e['note']      ?? '',
          }));

          const entry = {
            fromStage: 'field_review' as const,
            toStage:   'proposal' as const,
            timestamp: Timestamp.now(),
            actorUid:  currentUser.uid,
            actorName: currentUser.name,
            actorRole: 'field',
            note:      revisionNote,
          };

          tx.set(fieldReviewRef, {
            decision:      'revision',
            decidedAt:     serverTimestamp(),
            decidedBy:     currentUser.uid,
            decidedByName: currentUser.name,
            revisionNote:  revisionNote ?? '',
          });

          tx.update(taskRef, {
            pipelineStage:         'proposal',
            priorityScore:         computePriorityScore('proposal', 'completed'),
            proposalRevisionCount: increment(1),
            stageHistory:          [...cappedHistory, entry],
            updatedAt:             serverTimestamp(),
            // A revision request is a genuine fresh decision to redo proposal work —
            // any earlier correction-return pointer must not survive to hijack a
            // subsequent transition.
            correctionReturnTo:             null,
            correctionReturnAssignedTo:     null,
            correctionReturnAssignedToName: '',
            correctionNote:                 '',
            correctionSetAt:                null,
          });

          tx.update(doc(db, 'appConfig', 'global'), {
            'pipelineCounts.field_review':        increment(-1),
            'pipelineCounts.proposal':            increment(1),
            'pipelineCounts.unassigned_proposal': increment(1),
          });
        });

        try {
          const assigned = await assignLeastLoaded(
            taskId,
            'proposal',
            'proposalAssignedTo',
            'proposalAssignedToName',
          );
          if (assigned) {
            await updateDoc(doc(db, 'appConfig', 'global'), {
              'pipelineCounts.unassigned_proposal': increment(-1),
            }).catch(console.error);
          }
        } catch (err) {
          console.error('[revision] auto-assign failed:', err);
        }

        showToast('Revision requested. Task sent back to Proposal Team.', 'success');
      }
    } catch (err) {
      console.error('[submitFieldReviewDecision] failed:', err);
      void logError('pipeline.fieldReviewDecision', err, { taskId });
      showToast('Failed to submit decision. Try again.', 'error');
      throw err;
    }
  }

  // ── Submit Documents (documents → backend) ──────────────────────
  async function submitDocuments(taskId: string): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');

    const taskRef           = doc(db, 'tasks', taskId);
    const documentsStageRef = doc(db, 'tasks', taskId, 'stages', 'documents');

    try {
      let documentAnswers: Task['documentAnswers'] = {};
      let documentPhotos:  Task['documentPhotos']  = {};
      let docsTargetStage:     PipelineStage = 'backend';
      let docsIsReturning          = false;
      let docsReturnAssignedTo:    string | null = null;
      let docsReturnAssignedToName = '';

      await runTransaction(db, async (tx) => {
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        const appConfigForSaleClosedRef = doc(db, 'appConfig', 'global');
        const appConfigForSaleClosedSnap = await tx.get(appConfigForSaleClosedRef);

        documentAnswers = (taskSnap.data()?.['documentAnswers'] ?? {}) as Task['documentAnswers'];
        documentPhotos  = (taskSnap.data()?.['documentPhotos']  ?? {}) as Task['documentPhotos'];

        const saleClosedConfig = appConfigForSaleClosedSnap.data()?.['saleClosedConfig'] as
          import('@/types').SaleClosedConfig | undefined;
        const existingSaleClosedSource = taskSnap.data()?.['saleClosedSource'] as
          'auto' | 'manual' | null | undefined;
        const newSaleClosed = computeSaleClosedEvidence(
          {
            fieldAnswers:    taskSnap.data()?.['fieldAnswers'],
            fieldPhotos:     taskSnap.data()?.['fieldPhotos'],
            documentAnswers,
            documentPhotos,
          },
          saleClosedConfig,
        );
        const saleClosedUpdate = existingSaleClosedSource === 'manual'
          ? {}
          : { saleClosed: newSaleClosed, saleClosedSource: 'auto' as const };

        const corrResult = resolveCorrectionReturn(taskSnap.data() as Record<string, unknown>, 'backend');
        docsTargetStage          = corrResult.targetStage;
        docsIsReturning          = corrResult.isReturning;
        docsReturnAssignedTo     = corrResult.returnAssignedTo;
        docsReturnAssignedToName = corrResult.returnAssignedToName;

        const existingHistory = (taskSnap.data()?.['stageHistory'] ?? []) as Array<Record<string, unknown>>;
        const cappedHistory = existingHistory.slice(-49).map((e) => ({
          fromStage: e['fromStage'] ?? null,
          toStage:   e['toStage']   ?? '',
          timestamp: e['timestamp'] ?? Timestamp.now(),
          actorUid:  e['actorUid']  ?? '',
          actorName: e['actorName'] ?? '',
          actorRole: e['actorRole'] ?? '',
          note:      e['note']      ?? '',
        }));

        const entry = {
          fromStage: 'documents' as const,
          toStage:   docsTargetStage,
          timestamp: Timestamp.now(),
          actorUid:  currentUser.uid,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          note:      'Documents submitted',
        };

        tx.set(documentsStageRef, {
          documentAnswers,
          documentPhotos,
          submittedAt:     serverTimestamp(),
          submittedByUid:  currentUser.uid,
          submittedByName: currentUser.name,
        });

        const docsTaskUpdate: Record<string, unknown> = {
          documentsCompleted: true,
          pipelineStage:      docsTargetStage,
          priorityScore:      computePriorityScore(docsTargetStage, 'pending'),
          stageHistory:       [...cappedHistory, entry],
          updatedAt:          serverTimestamp(),
          correctionReturnTo:             null,
          correctionReturnAssignedTo:     null,
          correctionReturnAssignedToName: '',
          correctionNote:                 '',
          correctionSetAt:                null,
          ...saleClosedUpdate,
        };

        if (docsIsReturning && docsReturnAssignedTo && (docsTargetStage as string) === 'backend') {
          docsTaskUpdate['backendAssignedTo']     = docsReturnAssignedTo;
          docsTaskUpdate['backendAssignedToName'] = docsReturnAssignedToName;
        }

        tx.update(taskRef, docsTaskUpdate);

        const docsConfigUpdate: Record<string, unknown> = {
          'pipelineCounts.documents':               increment(-1),
          [`pipelineCounts.${docsTargetStage}`]:    increment(1),
        };
        if (docsIsReturning && docsReturnAssignedTo) {
          docsConfigUpdate[`memberCounts.${docsReturnAssignedTo}`] = increment(1);
        } else if ((docsTargetStage as string) === 'backend') {
          docsConfigUpdate['pipelineCounts.unassigned_backend'] = increment(1);
        }
        if (['completed', 'dropped'].includes(docsTargetStage as string)) {
          docsConfigUpdate['pipelineCounts.total_active'] = increment(-1);
        }
        tx.update(doc(db, 'appConfig', 'global'), docsConfigUpdate);
      });

      if ((docsTargetStage as string) === 'backend' && !(docsIsReturning && docsReturnAssignedTo)) {
        try {
          const assigned = await assignLeastLoaded(
            taskId,
            'backend',
            'backendAssignedTo',
            'backendAssignedToName',
          );
          if (assigned) {
            await updateDoc(doc(db, 'appConfig', 'global'), {
              'pipelineCounts.unassigned_backend': increment(-1),
            }).catch(console.error);
          }
        } catch (assignErr) {
          console.error('[Pipeline] auto-assign backend failed:', assignErr);
        }
      }

      showToast(
        docsIsReturning
          ? `Documents submitted. Correction resolved — task returned to ${docsTargetStage.replace('_', ' ')}.`
          : `Documents submitted. Task moved to ${docsTargetStage.replace('_', ' ')}.`,
        'success',
      );
    } catch (err) {
      console.error('[submitDocuments] failed:', err);
      void logError('pipeline.submitDocuments', err, { taskId });
      showToast('Failed to submit documents. Try again.', 'error');
      throw err;
    }
  }

  // ── Initialize Journey Steps (payment type selected) ─────────────
  async function initializeJourneySteps(
    taskId:      string,
    paymentType: 'cash' | 'loan',
    steps:       JourneyStepDefinition[],
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      const initialSteps: JourneyStepAnswer[] = steps.map((s) => ({
        stepId:     s.stepId,
        label:      s.label,
        type:       s.type,
        status:     'pending',
        realDate:   null,
        photoUrls:  [],
        recordedAt: null,
        recordedBy: '',
      }));

      await updateDoc(doc(db, 'tasks', taskId), {
        paymentType,
        applicationJourneySteps: initialSteps,
        currentStepIndex:        0,
        updatedAt:               serverTimestamp(),
      });
    } catch (err) {
      console.error('[initializeJourneySteps] failed:', err);
      void logError('pipeline.initializeJourneySteps', err, { taskId });
      throw err;
    }
  }

  // ── Complete Journey Step ──────────────────────────────────────────
  async function completeJourneyStep(
    taskId:       string,
    stepIndex:    number,
    realDate:     string,
    photoUrls:    string[],
    currentSteps: JourneyStepAnswer[],
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');

    try {
      const updatedSteps = currentSteps.map((s, i) => {
        if (i !== stepIndex) return cleanStep(s);
        return cleanStep({
          ...s,
          status:     'done' as const,
          realDate,
          photoUrls:  photoUrls ?? [],
          recordedAt: new Date(),
          recordedBy: currentUser.name,
        });
      });

      const nextIndex = stepIndex + 1;

      const isLastStep = nextIndex >= currentSteps.length;
      await updateDoc(doc(db, 'tasks', taskId), {
        applicationJourneySteps: updatedSteps,
        currentStepIndex:        nextIndex,
        ...(isLastStep ? { journeyCompleted: true } : {}),
        updatedAt:               serverTimestamp(),
      });
    } catch (err) {
      console.error('[completeJourneyStep] failed:', err);
      void logError('pipeline.completeJourneyStep', err, { taskId });
      showToast('Failed to save step. Try again.', 'error');
      throw err;
    }
  }

  // ── Mark Lead Converted ───────────────────────────────────────────
  async function markLeadConverted(
    taskId:      string,
    steps:       JourneyStepAnswer[],
    paymentType: 'cash' | 'loan',
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      const now   = Timestamp.now();
      const entry = {
        fromStage:  'backend'   as PipelineStage,
        toStage:    'completed' as PipelineStage,
        timestamp:  now,
        actorUid:   currentUser.uid,
        actorName:  currentUser.name,
        actorRole:  currentUser.role,
        note:       'Lead converted — all journey steps completed',
      };

      const backendStageRef = doc(db, 'tasks', taskId, 'stages', 'backend');
      const backendStageDoc = {
        applicationJourneySteps: steps.map(cleanStep),
        paymentType,
        completedAt:     now,
        completedByUid:  currentUser.uid,
        completedByName: currentUser.name,
      };

      await runTransaction(db, async (tx) => {
        const taskRef  = doc(db, 'tasks', taskId);
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        const existingHistory    = (taskSnap.data()?.['stageHistory'] ?? []) as Array<Record<string, unknown>>;
        const cappedHistory      = existingHistory.slice(-49).map((e) => ({
          fromStage: e['fromStage'] ?? null,
          toStage:   e['toStage']   ?? '',
          timestamp: e['timestamp'] ?? Timestamp.now(),
          actorUid:  e['actorUid']  ?? '',
          actorName: e['actorName'] ?? '',
          actorRole: e['actorRole'] ?? '',
          note:      e['note']      ?? '',
        }));
        const backendAssignedTo  = taskSnap.data()?.['backendAssignedTo'] as string | null;
        const assignedTo         = taskSnap.data()?.['assignedTo']     as string | null;
        const assignedToName     = (taskSnap.data()?.['assignedToName'] as string) || '';
        const district           = taskSnap.data()?.['district']       as string | null;

        tx.set(backendStageRef, backendStageDoc);
        tx.update(taskRef, {
          pipelineStage:    'completed',
          priorityScore:    computePriorityScore('completed', 'completed'),
          journeyCompleted: true,
          status:           'completed',
          updatedAt:        serverTimestamp(),
          stageHistory:     [...cappedHistory, entry],
        });
        const appConfigUpdates: Record<string, unknown> = {
          'pipelineCounts.backend':      increment(-1),
          'pipelineCounts.completed':    increment(1),
          'pipelineCounts.total_active': increment(-1),
        };
        if (backendAssignedTo) {
          appConfigUpdates[`memberCounts.${backendAssignedTo}`] = increment(-1);
        }
        if (assignedTo) {
          appConfigUpdates[`engineerCounts.${assignedTo}.completed`] = increment(1);
          appConfigUpdates[`engineerCounts.${assignedTo}.name`]      = assignedToName;
        }
        if (district) {
          appConfigUpdates[`districtCounts.${district}.completed`] = increment(1);
        }
        tx.update(doc(db, 'appConfig', 'global'), appConfigUpdates);
      });

      showToast('🎉 Lead marked as Converted!', 'success');
    } catch (err) {
      console.error('[markLeadConverted] failed:', err);
      void logError('pipeline.markLeadConverted', err, { taskId });
      showToast('Failed to convert lead. Try again.', 'error');
      throw err;
    }
  }

  // ── Save Journey Step Draft (No answer, no advance) ─────────────
  async function saveJourneyStepDraft(
    taskId:       string,
    stepIndex:    number,
    draftValue:   'no',
    draftDate:    string,
    currentSteps: JourneyStepAnswer[],
  ): Promise<void> {
    if (!currentUser) return;
    try {
      const updatedSteps = currentSteps.map((s, i) => {
        if (i !== stepIndex) return cleanStep(s);
        return cleanStep({
          ...s,
          status:     'pending' as const,
          realDate:   draftDate || null,
          inputValue: draftValue,
        });
      });
      await updateDoc(doc(db, 'tasks', taskId), {
        applicationJourneySteps: updatedSteps,
        updatedAt:               serverTimestamp(),
      });
    } catch (err) {
      console.error('[saveJourneyStepDraft] failed:', err);
      void logError('pipeline.saveJourneyStepDraft', err, { taskId });
    }
  }

  // ── Save Journey Step Remark (append-only, locked once step is done) ─────────
  async function saveJourneyStepRemark(
    taskId:       string,
    stepIndex:    number,
    text:         string,
    currentSteps: JourneyStepAnswer[],
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    if (!text.trim()) return;

    const targetStep = currentSteps[stepIndex];
    if (!targetStep) throw new Error('Step not found');
    if (targetStep.status === 'done') {
      throw new Error('Cannot add a remark to a step that is already complete.');
    }

    try {
      const newEntry: RemarkEntry = {
        text:       text.trim(),
        authorUid:  currentUser.uid,
        authorName: currentUser.name,
        authorRole: currentUser.role,
        createdAt:  new Date(),
      };

      const updatedSteps = currentSteps.map((s, i) => {
        if (i !== stepIndex) return cleanStep(s);
        return cleanStep({
          ...s,
          remarks: [...(s.remarks ?? []), newEntry],
        });
      });

      await updateDoc(doc(db, 'tasks', taskId), {
        applicationJourneySteps: updatedSteps,
        updatedAt:               serverTimestamp(),
      });
      showToast('Remark saved', 'success');
    } catch (err) {
      console.error('[saveJourneyStepRemark] failed:', err);
      void logError('pipeline.saveJourneyStepRemark', err, { taskId });
      showToast(
        err instanceof Error ? err.message : 'Failed to save remark. Try again.',
        'error',
      );
      throw err;
    }
  }

  // ── Update Backend Remark (universal/lead-level, overwritable) ────────────────
  async function updateBackendRemark(taskId: string, text: string): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        backendRemark:          text.trim(),
        backendRemarkUpdatedBy: currentUser.name,
        backendRemarkUpdatedAt: serverTimestamp(),
        updatedAt:              serverTimestamp(),
      });
      showToast('Remark updated', 'success');
    } catch (err) {
      console.error('[updateBackendRemark] failed:', err);
      void logError('pipeline.updateBackendRemark', err, { taskId });
      showToast('Failed to update remark. Try again.', 'error');
      throw err;
    }
  }

  // ── Update Proposal Remark (universal/lead-level, overwritable, internal) ────
  async function updateProposalRemark(taskId: string, text: string): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        proposalRemark:          text.trim(),
        proposalRemarkUpdatedBy: currentUser.name,
        proposalRemarkUpdatedAt: serverTimestamp(),
        updatedAt:               serverTimestamp(),
      });
      showToast('Remark updated', 'success');
    } catch (err) {
      console.error('[updateProposalRemark] failed:', err);
      void logError('pipeline.updateProposalRemark', err, { taskId });
      showToast('Failed to update remark. Try again.', 'error');
      throw err;
    }
  }

  async function reEngageLead(
    taskId: string,
    note:   string,
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      let blockedByArchive = false;
      const now   = Timestamp.now();
      const entry = {
        fromStage: 'dropped' as PipelineStage,
        toStage:   'proposal' as PipelineStage,
        timestamp:  now,
        actorUid:   currentUser.uid,
        actorName:  currentUser.name,
        actorRole:  currentUser.role,
        note:       note || 'Lead re-engaged by admin',
      };

      await runTransaction(db, async (tx) => {
        const taskRef  = doc(db, 'tasks', taskId);
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');
        if (taskSnap.data()['pipelineStage'] !== 'dropped') {
          throw new Error('Task is not in dropped state');
        }
        if (taskSnap.data()['archived'] === true) {
          blockedByArchive = true;
          return;
        }
        const existingHistory = (taskSnap.data()?.['stageHistory'] ?? []) as Array<Record<string, unknown>>;
        const cappedHistory   = existingHistory.slice(-49).map((e) => ({
          fromStage: e['fromStage'] ?? null,
          toStage:   e['toStage']   ?? '',
          timestamp: e['timestamp'] ?? Timestamp.now(),
          actorUid:  e['actorUid']  ?? '',
          actorName: e['actorName'] ?? '',
          actorRole: e['actorRole'] ?? '',
          note:      e['note']      ?? '',
        }));
        tx.update(taskRef, {
          pipelineStage: 'proposal',
          priorityScore: computePriorityScore('proposal', 'completed'),
          droppedReason: null,
          updatedAt:     serverTimestamp(),
          stageHistory:  [...cappedHistory, entry],
        });
        tx.update(doc(db, 'appConfig', 'global'), {
          'pipelineCounts.dropped':              increment(-1),
          'pipelineCounts.proposal':             increment(1),
          'pipelineCounts.total_active':         increment(1),
          'pipelineCounts.unassigned_proposal':  increment(1),
        });
      });

      if (blockedByArchive) {
        showToast('Cannot re-engage an archived task. Restore it first.', 'error');
        return;
      }

      // Assign to least loaded proposal member
      try {
        const assigned = await assignLeastLoaded(
          taskId,
          'proposal',
          'proposalAssignedTo',
          'proposalAssignedToName',
        );
        if (assigned) {
          await updateDoc(doc(db, 'appConfig', 'global'), {
            'pipelineCounts.unassigned_proposal': increment(-1),
          }).catch(console.error);
        }
      } catch (err) {
        console.error('[reEngageLead] auto-assign failed:', err);
      }

      showToast('Lead re-engaged and moved to Proposal stage', 'success');
    } catch (err) {
      console.error('[reEngageLead] failed:', err);
      showToast('Failed to re-engage lead. Try again.', 'error');
      throw err;
    }
  }

  async function adminOverrideStage(
    taskId:        string,
    newStage:      PipelineStage,
    note:          string,
    isCorrection:  boolean = false,
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    if (currentUser.role !== 'admin') throw new Error('Admin only');
    try {
      const now          = Timestamp.now();
      const taskRef      = doc(db, 'tasks', taskId);
      const appConfigRef = doc(db, 'appConfig', 'global');

      await runTransaction(db, async (tx) => {
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        const currentStage   = taskSnap.data()['pipelineStage'] as string;
        const currentStatus  = taskSnap.data()['status'] as string;
        const proposalUid    = taskSnap.data()['proposalAssignedTo'] as string | null;
        const backendUid     = taskSnap.data()['backendAssignedTo']  as string | null;
        const assignedTo     = taskSnap.data()['assignedTo']     as string | null;
        const assignedToName = (taskSnap.data()['assignedToName'] as string) || '';
        const district       = taskSnap.data()['district']       as string | null;
        const existingHistory = (taskSnap.data()?.['stageHistory'] ?? []) as Array<Record<string, unknown>>;
        const cappedHistory   = existingHistory.slice(-49).map((e) => ({
          fromStage: e['fromStage'] ?? null,
          toStage:   e['toStage']   ?? '',
          timestamp: e['timestamp'] ?? Timestamp.now(),
          actorUid:  e['actorUid']  ?? '',
          actorName: e['actorName'] ?? '',
          actorRole: e['actorRole'] ?? '',
          note:      e['note']      ?? '',
        }));

        const entry = {
          fromStage: currentStage as PipelineStage,
          toStage:   newStage,
          timestamp: now,
          actorUid:  currentUser.uid,
          actorName: currentUser.name,
          actorRole: 'admin_override',
          note:      note || `Admin moved from ${currentStage} to ${newStage}`,
        };

        const taskFieldUpdates: Record<string, unknown> = {
          pipelineStage: newStage,
          priorityScore: computePriorityScore(newStage, currentStatus),
          updatedAt:     serverTimestamp(),
          stageHistory:  [...cappedHistory, entry],
        };

        if (currentStage === 'proposal' && newStage !== 'proposal') {
          taskFieldUpdates['proposalAssignedTo']     = null;
          taskFieldUpdates['proposalAssignedToName'] = '';
        }
        if (currentStage === 'backend' && newStage !== 'backend') {
          taskFieldUpdates['backendAssignedTo']     = null;
          taskFieldUpdates['backendAssignedToName'] = '';
        }

        if (currentStatus === 'completed' && newStage !== 'completed') {
          taskFieldUpdates['status'] = 'pending';
        }

        if (isCorrection) {
          taskFieldUpdates['correctionReturnTo']             = currentStage as PipelineStage;
          taskFieldUpdates['correctionReturnAssignedTo']     = currentStage === 'proposal' ? proposalUid
                                                             : currentStage === 'backend'  ? backendUid
                                                             : null;
          taskFieldUpdates['correctionReturnAssignedToName'] = currentStage === 'proposal'
                                                             ? ((taskSnap.data()['proposalAssignedToName'] as string) ?? '')
                                                             : currentStage === 'backend'
                                                             ? ((taskSnap.data()['backendAssignedToName']  as string) ?? '')
                                                             : '';
          taskFieldUpdates['correctionNote']  = note || `Sent back from ${currentStage} for correction`;
          taskFieldUpdates['correctionSetAt'] = now;
          if (newStage === 'survey') {
            taskFieldUpdates['followUpDate'] = null;
            taskFieldUpdates['dueDate']      = null;
          }
        } else {
          taskFieldUpdates['correctionReturnTo']             = null;
          taskFieldUpdates['correctionReturnAssignedTo']     = null;
          taskFieldUpdates['correctionReturnAssignedToName'] = '';
          taskFieldUpdates['correctionNote']                 = '';
          taskFieldUpdates['correctionSetAt']                = null;
        }

        const overrideConfigUpdates: Record<string, unknown> = {
          [`pipelineCounts.${currentStage}`]: increment(-1),
          [`pipelineCounts.${newStage}`]:     increment(1),
          ...(['completed', 'dropped'].includes(newStage) && !['completed', 'dropped'].includes(currentStage)
            ? { 'pipelineCounts.total_active': increment(-1) }
            : {}),
          ...(!['completed', 'dropped'].includes(newStage) && ['completed', 'dropped'].includes(currentStage)
            ? { 'pipelineCounts.total_active': increment(1) }
            : {}),
        };

        if (currentStage === 'proposal' && proposalUid) {
          overrideConfigUpdates[`memberCounts.${proposalUid}`] = increment(-1);
        }
        if (currentStage === 'backend' && backendUid) {
          overrideConfigUpdates[`memberCounts.${backendUid}`] = increment(-1);
        }
        if (newStage === 'proposal') {
          overrideConfigUpdates['pipelineCounts.unassigned_proposal'] = increment(1);
        }
        if (newStage === 'backend') {
          overrideConfigUpdates['pipelineCounts.unassigned_backend'] = increment(1);
        }

        if (newStage === 'completed' && currentStage !== 'completed') {
          if (assignedTo) {
            overrideConfigUpdates[`engineerCounts.${assignedTo}.completed`] = increment(1);
            overrideConfigUpdates[`engineerCounts.${assignedTo}.name`]      = assignedToName;
          }
          if (district) {
            overrideConfigUpdates[`districtCounts.${district}.completed`] = increment(1);
          }
        } else if (currentStage === 'completed' && newStage !== 'completed') {
          if (assignedTo) {
            overrideConfigUpdates[`engineerCounts.${assignedTo}.completed`] = increment(-1);
            overrideConfigUpdates[`engineerCounts.${assignedTo}.name`]      = assignedToName;
          }
          if (district) {
            overrideConfigUpdates[`districtCounts.${district}.completed`] = increment(-1);
          }
        }

        tx.update(taskRef, taskFieldUpdates);
        tx.update(appConfigRef, overrideConfigUpdates);
      });

      // Auto-assign if moving to proposal or backend stage
      if (newStage === 'proposal') {
        try {
          const assigned = await assignLeastLoaded(
            taskId,
            'proposal',
            'proposalAssignedTo',
            'proposalAssignedToName',
          );
          if (assigned) {
            await updateDoc(appConfigRef, {
              'pipelineCounts.unassigned_proposal': increment(-1),
            }).catch(console.error);
          }
        } catch (err) {
          console.error('[adminOverride] auto-assign proposal failed:', err);
        }
      }

      if (newStage === 'backend') {
        try {
          const assigned = await assignLeastLoaded(
            taskId,
            'backend',
            'backendAssignedTo',
            'backendAssignedToName',
          );
          if (assigned) {
            await updateDoc(appConfigRef, {
              'pipelineCounts.unassigned_backend': increment(-1),
            }).catch(console.error);
          }
        } catch (err) {
          console.error('[adminOverride] auto-assign backend failed:', err);
        }
      }

      showToast(`Stage changed to ${newStage}`, 'success');
    } catch (err) {
      console.error('[adminOverrideStage] failed:', err);
      showToast('Failed to change stage. Try again.', 'error');
      throw err;
    }
  }

  return { submitProposal, assignStageTeamMember, submitFieldReviewDecision, submitDocuments, initializeJourneySteps, completeJourneyStep, markLeadConverted, saveJourneyStepDraft, saveJourneyStepRemark, updateBackendRemark, updateProposalRemark, reEngageLead, adminOverrideStage };
}
