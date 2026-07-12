import {
  doc, updateDoc, setDoc, getDoc,
  serverTimestamp, arrayUnion, Timestamp, increment,
  runTransaction,
} from 'firebase/firestore';
import { db }           from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useToast }     from '@/components/ui/toast';
import { assignLeastLoaded } from '@/utils/findLeastLoadedUser';
import { getProposalDocuments } from '@/utils/proposalDocuments';
import { computePriorityScore } from '@/utils/taskScoring';
import type { Task, PipelineStage, ProposalStageData, JourneyStepDefinition, JourneyStepAnswer } from '@/types';

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
  return base;
}

export function usePipelineActions() {
  const { currentUser } = useAuthStore();
  const { showToast }   = useToast();

  // ── Submit Proposal (proposal → field_review) ──────────────────
  async function submitProposal(
    taskId:    string,
    documents: { url: string; name: string }[],
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');

    const taskRef          = doc(db, 'tasks', taskId);
    const proposalStageRef = doc(db, 'tasks', taskId, 'stages', 'proposal');

    try {
      // Check if a previous proposal exists (revision case)
      const existingSnap = await getDoc(proposalStageRef);
      const revisions: ProposalStageData['revisions'] = [];

      if (existingSnap.exists()) {
        const existing = existingSnap.data() as ProposalStageData;
        const existingDocuments = getProposalDocuments(existing);
        // Move current proposal to revisions before overwriting — works whether
        // the existing stage doc is old-shape (documentUrl only) or new-shape
        // (documents array), since getProposalDocuments() normalizes both.
        if (existingDocuments.length > 0) {
          revisions.push(...(existing.revisions ?? []), {
            documentUrl:    existingDocuments[0].url,
            documentName:   existingDocuments[0].name,
            uploadedAt:     (existing.uploadedAt as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date(),
            uploadedBy:     existing.uploadedBy ?? '',
            uploadedByName: existing.uploadedByName ?? '',
            revisionNote:   '',
            documents:      existingDocuments,
          });
        }
      }

      // Write stages/proposal document. documentUrl/documentName mirror
      // documents[0] (dual-write) so any screen not yet updated to read
      // `documents` keeps seeing the first uploaded file exactly as before.
      await setDoc(proposalStageRef, {
        documentUrl:    documents[0].url,
        documentName:   documents[0].name,
        documents,
        uploadedAt:     serverTimestamp(),
        uploadedBy:     currentUser.uid,
        uploadedByName: currentUser.name,
        revisions,
      });

      // Stage history entry (client timestamp — cannot use serverTimestamp in arrayUnion)
      const stageHistoryEntry = {
        fromStage: 'proposal' as const,
        toStage:   'field_review' as const,
        timestamp: Timestamp.now(),
        actorUid:  currentUser.uid,
        actorName: currentUser.name,
        actorRole: 'proposal',
        note:      '',
      };

      // Read proposalAssignedTo before updateDoc
      const taskSnap = await getDoc(taskRef);
      const proposalAssignedTo = taskSnap.data()?.['proposalAssignedTo'] as string | null;

      // Advance pipeline stage on task document
      await updateDoc(taskRef, {
        pipelineStage:         'field_review',
        priorityScore:         computePriorityScore('field_review', 'completed'),
        proposalRevisionCount: revisions.length,
        stageHistory:          arrayUnion(stageHistoryEntry),
        updatedAt:             serverTimestamp(),
      });

      const appConfigUpdate: Record<string, unknown> = {
        'pipelineCounts.proposal':     increment(-1),
        'pipelineCounts.field_review': increment(1),
      };
      if (proposalAssignedTo) {
        appConfigUpdate[`memberCounts.${proposalAssignedTo}`] = increment(-1);
      }
      await updateDoc(
        doc(db, 'appConfig', 'global'),
        appConfigUpdate,
      ).catch(console.error);

      showToast('Proposal submitted. Task moved to Field Review.', 'success');
    } catch (err) {
      console.error('[submitProposal] failed:', err);
      showToast('Failed to submit proposal. Try again.', 'error');
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

        const targetStage = await runTransaction(db, async (tx): Promise<'documents' | 'backend'> => {
          const [taskSnap, configSnap] = await Promise.all([
            tx.get(taskRef),
            tx.get(appConfigRef),
          ]);
          if (!taskSnap.exists()) throw new Error('Task not found');

          // Skip the Documents stage entirely if the admin hasn't configured
          // any document fields — nothing for the field engineer to fill in.
          const documentTemplate = (configSnap.data()?.['documentTemplate'] ?? []) as unknown[];
          const targetStage: 'documents' | 'backend' = documentTemplate.length > 0 ? 'documents' : 'backend';

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

          tx.update(taskRef, {
            pipelineStage: targetStage,
            priorityScore: computePriorityScore(targetStage, 'pending'),
            stageHistory:  [...cappedHistory, entry],
            updatedAt:     serverTimestamp(),
          });

          if (targetStage === 'documents') {
            tx.update(appConfigRef, {
              'pipelineCounts.field_review': increment(-1),
              'pipelineCounts.documents':    increment(1),
            });
          } else {
            tx.update(appConfigRef, {
              'pipelineCounts.field_review':       increment(-1),
              'pipelineCounts.backend':             increment(1),
              'pipelineCounts.unassigned_backend':  increment(1),
            });
          }

          return targetStage;
        });

        if (targetStage === 'backend') {
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
          targetStage === 'documents'
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
            pipelineStage: 'dropped',
            priorityScore: computePriorityScore('dropped', 'completed'),
            droppedReason: revisionNote ?? 'Consumer rejected proposal',
            stageHistory:  [...cappedHistory, entry],
            updatedAt:     serverTimestamp(),
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

      await runTransaction(db, async (tx) => {
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        documentAnswers = (taskSnap.data()?.['documentAnswers'] ?? {}) as Task['documentAnswers'];
        documentPhotos  = (taskSnap.data()?.['documentPhotos']  ?? {}) as Task['documentPhotos'];

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
          toStage:   'backend'   as const,
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

        tx.update(taskRef, {
          documentsCompleted: true,
          pipelineStage:      'backend',
          priorityScore:      computePriorityScore('backend', 'pending'),
          stageHistory:       [...cappedHistory, entry],
          updatedAt:          serverTimestamp(),
        });

        tx.update(doc(db, 'appConfig', 'global'), {
          'pipelineCounts.documents':           increment(-1),
          'pipelineCounts.backend':             increment(1),
          'pipelineCounts.unassigned_backend':  increment(1),
        });
      });

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

      showToast('Documents submitted. Task moved to Backend.', 'success');
    } catch (err) {
      console.error('[submitDocuments] failed:', err);
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
        tx.update(doc(db, 'appConfig', 'global'), appConfigUpdates);
      });

      showToast('🎉 Lead marked as Converted!', 'success');
    } catch (err) {
      console.error('[markLeadConverted] failed:', err);
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
    taskId:   string,
    newStage: PipelineStage,
    note:     string,
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

        const currentStage  = taskSnap.data()['pipelineStage'] as string;
        const currentStatus = taskSnap.data()['status'] as string;
        const proposalUid   = taskSnap.data()['proposalAssignedTo'] as string | null;
        const backendUid    = taskSnap.data()['backendAssignedTo']  as string | null;
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

  return { submitProposal, assignStageTeamMember, submitFieldReviewDecision, submitDocuments, initializeJourneySteps, completeJourneyStep, markLeadConverted, saveJourneyStepDraft, reEngageLead, adminOverrideStage };
}
