import {
  collection, doc, getDoc, updateDoc,
  runTransaction, serverTimestamp, Timestamp, increment, arrayUnion,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toast';
import { computePriorityScore, computeTitleWords } from '@/utils/taskScoring';
import { resolveDistrictCasing, resolveAndAutoAddStateDistrict } from '@/utils/districtUtils';
import { logError } from '@/utils/logError';
import { computeSaleClosedEvidence } from '@/utils/computeSaleClosed';
import type { FieldEngineer } from '@/hooks/useFieldEngineers';

interface CreateTaskData {
  title:            string;
  description?:     string;
  state?:           string;
  district?:        string;
  leadSource?:              string;
  leadSourceEmployeeName?:  string;
  leadGeneratedByUid?:      string | null;
  leadGeneratedByName?:     string;
  leadGeneratedByNote?:     string;
  assignedTo:       string | null;
  assignedToName:   string;
  assignedToCode:   string;
  assignedToMobile?: string;
  consumerMobile:   string;
  dueDate:          Date | null;
}

export function useTaskActions() {
  const { currentUser } = useAuthStore();
  const { showToast }   = useToast();

  async function createTask(data: CreateTaskData): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');

    const configRef = doc(db, 'appConfig', 'global');
    const taskRef   = doc(collection(db, 'tasks'));
    let taskNum = '';
    let resolvedLeadSource  = '';
    let existingLeadSources: string[] = [];

    // Resolve state+district BEFORE the transaction (the helper does its own
    // getDoc + best-effort arrayUnion; those cannot run inside runTransaction).
    const { resolvedState, resolvedDistrict } =
      (data.state || data.district)
        ? await resolveAndAutoAddStateDistrict(db, data.state ?? '', data.district ?? '')
        : { resolvedState: '', resolvedDistrict: '' };

    await runTransaction(db, async (tx) => {
      const configSnap = await tx.get(configRef);
      const next = ((configSnap.data()?.['taskNumCounter'] as number | undefined) ?? 0) + 1;
      taskNum           = `T-${String(next).padStart(3, '0')}`;
      const templateFields = (configSnap.data()?.['taskTemplate'] as unknown[]) ?? [];
      existingLeadSources  = (configSnap.data()?.['leadSources']  as string[]) ?? [];
      resolvedLeadSource   = data.leadSource
        ? resolveDistrictCasing(data.leadSource, existingLeadSources)
        : '';

      const configUpdates: Record<string, unknown> = {
        taskNumCounter:                next,
        'pipelineCounts.survey':       increment(1),
        'pipelineCounts.total_active': increment(1),
      };
      if (data.assignedTo) {
        configUpdates[`engineerCounts.${data.assignedTo}.assigned`] = increment(1);
        configUpdates[`engineerCounts.${data.assignedTo}.name`]     = data.assignedToName;
      }
      if (resolvedDistrict) {
        configUpdates[`districtCounts.${resolvedDistrict}.total`] = increment(1);
      }
      tx.update(configRef, configUpdates);

      tx.set(taskRef, {
        taskNum,
        title:            data.title.trim(),
        titleLower:       data.title.trim().toLowerCase(),
        titleWords:       computeTitleWords(data.title),
        priorityScore:    computePriorityScore('survey', 'pending'),
        description:      data.description?.trim() ?? '',
        state:                   resolvedState    || null,
        district:                resolvedDistrict || null,
        leadSource:              resolvedLeadSource                   || null,
        leadSourceEmployeeName:  data.leadSourceEmployeeName?.trim() || null,
        leadGeneratedByUid:      data.leadGeneratedByUid             ?? null,
        leadGeneratedByName:     data.leadGeneratedByName            ?? '',
        leadGeneratedByNote:     data.leadGeneratedByNote?.trim()    || null,
        assignedTo:       data.assignedTo,
        assignedToName:   data.assignedToName,
        assignedToCode:   data.assignedToCode,
        assignedToMobile: data.assignedToMobile ?? '',
        consumerMobile:   data.consumerMobile.trim(),
        dueDate:          data.dueDate ? Timestamp.fromDate(data.dueDate) : null,
        followUpDate:     null,
        status:           'pending',
        fields:           templateFields,
        fieldAnswers:     {},
        fieldPhotos:      {},
        completionPhotos: [],
        blockedReason:    null,
        location:         null,
        submittedBy:      null,
        submittedAt:      null,
        archived:                false,
        pipelineStage:           'survey' as const,
        stageHistory:            [],
        proposalAssignedTo:      null,
        proposalAssignedToName:  '',
        backendAssignedTo:       null,
        backendAssignedToName:   '',
        proposalRevisionCount:   0,
        droppedReason:           null,
        paymentType:             null,
        applicationJourneySteps: [],
        currentStepIndex:        0,
        journeyCompleted:        false,
        createdBy:               currentUser.uid,
        createdAt:        serverTimestamp(),
        updatedAt:        serverTimestamp(),
      });
    });

    // District/state auto-add is handled by resolveAndAutoAddStateDistrict above.

    if (resolvedLeadSource && !existingLeadSources.some(
      (s) => s.toLowerCase() === resolvedLeadSource.toLowerCase(),
    )) {
      updateDoc(doc(db, 'appConfig', 'global'), {
        leadSources: arrayUnion(resolvedLeadSource),
      }).catch((err) => console.error('[createTask] leadSource arrayUnion failed:', err));
    }

    showToast(`Task ${taskNum} created`, 'success');
  }

  async function assignTask(
    taskId:   string,
    engineer: FieldEngineer,
  ): Promise<void> {
    try {
      const taskRef      = doc(db, 'tasks', taskId);
      const appConfigRef = doc(db, 'appConfig', 'global');
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(taskRef);
        if (!snap.exists()) throw new Error('Task not found');

        const currentAssignedTo   = snap.data()['assignedTo']     as string | null;
        const currentAssigneeName = (snap.data()['assignedToName'] as string) || '';
        const currentStage        = (snap.data()['pipelineStage']  as string) ?? 'survey';
        const isArchived          = (snap.data()['archived']        as boolean) ?? false;

        if (currentAssignedTo && currentAssignedTo !== engineer.uid) {
          console.warn(
            `[assignTask] Reassigning from ${currentAssigneeName} to ${engineer.displayName}`,
          );
        }

        tx.update(taskRef, {
          assignedTo:       engineer.uid,
          assignedToName:   engineer.displayName,
          assignedToCode:   engineer.engineerCode ?? '',
          assignedToMobile: engineer.mobileNumber ?? '',
          updatedAt:        serverTimestamp(),
        });

        if (!isArchived && currentAssignedTo !== engineer.uid) {
          const ecUpdates: Record<string, unknown> = {};
          if (currentAssignedTo) {
            ecUpdates[`engineerCounts.${currentAssignedTo}.assigned`] = increment(-1);
            ecUpdates[`engineerCounts.${currentAssignedTo}.name`]     = currentAssigneeName;
            if (currentStage === 'completed') {
              ecUpdates[`engineerCounts.${currentAssignedTo}.completed`] = increment(-1);
            }
          }
          ecUpdates[`engineerCounts.${engineer.uid}.assigned`] = increment(1);
          ecUpdates[`engineerCounts.${engineer.uid}.name`]     = engineer.displayName;
          if (currentStage === 'completed') {
            ecUpdates[`engineerCounts.${engineer.uid}.completed`] = increment(1);
          }
          tx.update(appConfigRef, ecUpdates);
        }
      });
      showToast(`Assigned to ${engineer.displayName}`, 'success');
    } catch (err) {
      console.error('[assignTask] failed:', err);
      showToast('Failed to assign task. Try again.', 'error');
      throw err;
    }
  }

  async function archiveTask(taskId: string): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      const taskRef      = doc(db, 'tasks', taskId);
      const appConfigRef = doc(db, 'appConfig', 'global');

      await runTransaction(db, async (tx) => {
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        const data           = taskSnap.data();
        const stage          = (data['pipelineStage']  as string) ?? 'survey';
        const proposalUid    = data['proposalAssignedTo'] as string | null;
        const backendUid     = data['backendAssignedTo']  as string | null;
        const archived       = data['archived'] as boolean;
        const assignedTo     = data['assignedTo']     as string | null;
        const assignedToName = (data['assignedToName'] as string) || '';
        const district       = (data['district']       as string | null) ?? null;

        if (archived) throw new Error('Task already archived');

        tx.update(taskRef, {
          archived:   true,
          archivedAt: serverTimestamp(),
          updatedAt:  serverTimestamp(),
        });

        const pcUpdates: Record<string, unknown> = {};
        const mcUpdates: Record<string, unknown> = {};

        const activeStages   = ['survey', 'proposal', 'field_review', 'documents', 'backend'];
        const terminalStages = ['completed', 'dropped'];
        if (activeStages.includes(stage)) {
          pcUpdates[`pipelineCounts.${stage}`]     = increment(-1);
          pcUpdates['pipelineCounts.total_active'] = increment(-1);
        } else if (terminalStages.includes(stage)) {
          pcUpdates[`pipelineCounts.${stage}`]     = increment(-1);
        }

        if (stage === 'proposal' && !proposalUid) {
          pcUpdates['pipelineCounts.unassigned_proposal'] = increment(-1);
        }
        if (stage === 'backend' && !backendUid) {
          pcUpdates['pipelineCounts.unassigned_backend'] = increment(-1);
        }

        if (stage === 'proposal' && proposalUid) {
          mcUpdates[`memberCounts.${proposalUid}`] = increment(-1);
        }
        if (stage === 'backend' && backendUid) {
          mcUpdates[`memberCounts.${backendUid}`] = increment(-1);
        }

        if (assignedTo) {
          pcUpdates[`engineerCounts.${assignedTo}.assigned`] = increment(-1);
          pcUpdates[`engineerCounts.${assignedTo}.name`]     = assignedToName;
          if (stage === 'completed') {
            pcUpdates[`engineerCounts.${assignedTo}.completed`] = increment(-1);
          }
        }
        if (district) {
          pcUpdates[`districtCounts.${district}.total`] = increment(-1);
          if (stage === 'completed') {
            pcUpdates[`districtCounts.${district}.completed`] = increment(-1);
          }
        }

        const allUpdates = { ...pcUpdates, ...mcUpdates };
        if (Object.keys(allUpdates).length > 0) {
          tx.update(appConfigRef, allUpdates);
        }
      });

      showToast('Task archived', 'success');
    } catch (err) {
      console.error('[archiveTask] failed:', err);
      showToast('Failed to archive task. Try again.', 'error');
      throw err;
    }
  }

  async function updateTaskTitle(
    taskId:   string,
    newTitle: string,
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    if (!newTitle.trim()) throw new Error('Title cannot be empty');
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        title:      newTitle.trim(),
        titleLower: newTitle.trim().toLowerCase(),
        titleWords: computeTitleWords(newTitle),
        updatedAt:  serverTimestamp(),
      });
      showToast('Title updated', 'success');
    } catch (err) {
      console.error('[updateTaskTitle] failed:', err);
      showToast('Failed to update title. Try again.', 'error');
      throw err;
    }
  }

  async function updateTaskDueDate(
    taskId:  string,
    dueDate: Date | null,
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        dueDate:   dueDate ? Timestamp.fromDate(dueDate) : null,
        updatedAt: serverTimestamp(),
      });
      showToast(dueDate ? 'Due date updated' : 'Due date cleared', 'success');
    } catch (err) {
      console.error('[updateTaskDueDate] failed:', err);
      showToast('Failed to update due date. Try again.', 'error');
      throw err;
    }
  }

  async function updateTaskDescription(
    taskId:      string,
    description: string,
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        description: description.trim(),
        updatedAt:   serverTimestamp(),
      });
      showToast('Description updated', 'success');
    } catch (err) {
      console.error('[updateTaskDescription] failed:', err);
      showToast('Failed to update description. Try again.', 'error');
      throw err;
    }
  }

  async function updateTaskConsumerMobile(
    taskId: string,
    mobile: string,
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    if (!/^\d{10}$/.test(mobile.trim())) {
      showToast('Consumer mobile must be exactly 10 digits.', 'error');
      throw new Error('Invalid mobile number');
    }
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        consumerMobile: mobile.trim(),
        updatedAt:      serverTimestamp(),
      });
      showToast('Consumer mobile updated', 'success');
    } catch (err) {
      console.error('[updateTaskConsumerMobile] failed:', err);
      showToast('Failed to update consumer mobile. Try again.', 'error');
      throw err;
    }
  }

  async function updateTaskDistrict(taskId: string, district: string, state: string): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      // Resolve BEFORE transaction — helper does its own getDoc + arrayUnion
      const { resolvedState, resolvedDistrict } =
        await resolveAndAutoAddStateDistrict(db, state, district);

      const taskRef      = doc(db, 'tasks', taskId);
      const appConfigRef = doc(db, 'appConfig', 'global');

      await runTransaction(db, async (tx) => {
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        const data        = taskSnap.data();
        const oldDistrict = (data['district']      as string | null) ?? null;
        const oldStage    = (data['pipelineStage'] as string) ?? 'survey';
        const isArchived  = (data['archived']      as boolean) ?? false;

        tx.update(taskRef, {
          state:     resolvedState    || null,
          district:  resolvedDistrict || null,
          updatedAt: serverTimestamp(),
        });

        const newDistrict = resolvedDistrict || null;
        if (!isArchived && oldDistrict !== newDistrict) {
          const dcUpdates: Record<string, unknown> = {};
          if (oldDistrict) {
            dcUpdates[`districtCounts.${oldDistrict}.total`] = increment(-1);
            if (oldStage === 'completed') {
              dcUpdates[`districtCounts.${oldDistrict}.completed`] = increment(-1);
            }
          }
          if (newDistrict) {
            dcUpdates[`districtCounts.${newDistrict}.total`] = increment(1);
            if (oldStage === 'completed') {
              dcUpdates[`districtCounts.${newDistrict}.completed`] = increment(1);
            }
          }
          if (Object.keys(dcUpdates).length > 0) {
            tx.update(appConfigRef, dcUpdates);
          }
        }
      });

      showToast('Location updated', 'success');
    } catch (err) {
      console.error('[updateTaskDistrict] failed:', err);
      showToast('Failed to update location. Try again.', 'error');
      throw err;
    }
  }

  async function unarchiveTask(taskId: string): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      const taskRef      = doc(db, 'tasks', taskId);
      const appConfigRef = doc(db, 'appConfig', 'global');

      await runTransaction(db, async (tx) => {
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        const data           = taskSnap.data();
        const stage          = (data['pipelineStage']  as string) ?? 'survey';
        const proposalUid    = data['proposalAssignedTo'] as string | null;
        const backendUid     = data['backendAssignedTo']  as string | null;
        const archived       = data['archived'] as boolean;
        const assignedTo     = data['assignedTo']     as string | null;
        const assignedToName = (data['assignedToName'] as string) || '';
        const district       = (data['district']       as string | null) ?? null;

        if (!archived) throw new Error('Task is not archived');

        tx.update(taskRef, {
          archived:   false,
          archivedAt: null,
          updatedAt:  serverTimestamp(),
        });

        const allUpdates: Record<string, unknown> = {};

        const activeStages   = ['survey', 'proposal', 'field_review', 'documents', 'backend'];
        const terminalStages = ['completed', 'dropped'];
        if (activeStages.includes(stage)) {
          allUpdates[`pipelineCounts.${stage}`]     = increment(1);
          allUpdates['pipelineCounts.total_active'] = increment(1);
        } else if (terminalStages.includes(stage)) {
          allUpdates[`pipelineCounts.${stage}`]     = increment(1);
        }

        if (stage === 'proposal' && !proposalUid) {
          allUpdates['pipelineCounts.unassigned_proposal'] = increment(1);
        }
        if (stage === 'backend' && !backendUid) {
          allUpdates['pipelineCounts.unassigned_backend'] = increment(1);
        }

        if (stage === 'proposal' && proposalUid) {
          allUpdates[`memberCounts.${proposalUid}`] = increment(1);
        }
        if (stage === 'backend' && backendUid) {
          allUpdates[`memberCounts.${backendUid}`] = increment(1);
        }

        if (assignedTo) {
          allUpdates[`engineerCounts.${assignedTo}.assigned`] = increment(1);
          allUpdates[`engineerCounts.${assignedTo}.name`]     = assignedToName;
          if (stage === 'completed') {
            allUpdates[`engineerCounts.${assignedTo}.completed`] = increment(1);
          }
        }
        if (district) {
          allUpdates[`districtCounts.${district}.total`] = increment(1);
          if (stage === 'completed') {
            allUpdates[`districtCounts.${district}.completed`] = increment(1);
          }
        }

        if (Object.keys(allUpdates).length > 0) {
          tx.update(appConfigRef, allUpdates);
        }
      });

      showToast('Task restored', 'success');
    } catch (err) {
      console.error('[unarchiveTask] failed:', err);
      showToast('Failed to restore task. Try again.', 'error');
      throw err;
    }
  }

  async function updateTaskLeadSource(
    taskId: string,
    leadSource: string,
    extra?: {
      leadSourceEmployeeName?: string;
      leadGeneratedByUid?:     string | null;
      leadGeneratedByName?:    string;
      leadGeneratedByNote?:    string;
    },
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      const configSnap = await getDoc(doc(db, 'appConfig', 'global'));
      const existingLeadSources = (configSnap.data()?.['leadSources'] as string[]) ?? [];
      const resolved = leadSource.trim()
        ? resolveDistrictCasing(leadSource.trim(), existingLeadSources)
        : '';

      await updateDoc(doc(db, 'tasks', taskId), {
        leadSource:              resolved || null,
        leadSourceEmployeeName:  extra?.leadSourceEmployeeName?.trim() || null,
        leadGeneratedByUid:      extra?.leadGeneratedByUid             ?? null,
        leadGeneratedByName:     extra?.leadGeneratedByName            ?? '',
        leadGeneratedByNote:     extra?.leadGeneratedByNote?.trim()    || null,
        updatedAt:               serverTimestamp(),
      });

      if (resolved && !existingLeadSources.some(
        (s) => s.toLowerCase() === resolved.toLowerCase(),
      )) {
        updateDoc(doc(db, 'appConfig', 'global'), {
          leadSources: arrayUnion(resolved),
        }).catch((err) => console.error('[updateTaskLeadSource] arrayUnion failed:', err));
      }

      showToast('Lead source updated', 'success');
    } catch (err) {
      console.error('[updateTaskLeadSource] failed:', err);
      showToast('Failed to update lead source. Try again.', 'error');
      throw err;
    }
  }

  async function setSaleClosedManual(taskId: string, value: boolean): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        saleClosed:       value,
        saleClosedSource: 'manual',
        updatedAt:        serverTimestamp(),
      });
      showToast(value ? 'Marked as Sales Closed' : 'Unmarked as Sales Closed', 'success');
    } catch (err) {
      console.error('[setSaleClosedManual] failed:', err);
      void logError('taskActions.setSaleClosedManual', err, { taskId });
      showToast('Failed to update Sales Closed status. Try again.', 'error');
      throw err;
    }
  }

  async function resetSaleClosedToAuto(taskId: string): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      const taskRef = doc(db, 'tasks', taskId);
      const [taskSnap, cfgSnap] = await Promise.all([
        getDoc(taskRef),
        getDoc(doc(db, 'appConfig', 'global')),
      ]);
      const taskData = taskSnap.data() ?? {};
      const saleClosedConfig = cfgSnap.data()?.['saleClosedConfig'] as
        import('@/types').SaleClosedConfig | undefined;
      const recomputed = computeSaleClosedEvidence(
        {
          fieldAnswers:    taskData['fieldAnswers'],
          fieldPhotos:     taskData['fieldPhotos'],
          documentAnswers: taskData['documentAnswers'],
          documentPhotos:  taskData['documentPhotos'],
        },
        saleClosedConfig,
      );

      await updateDoc(taskRef, {
        saleClosed:       recomputed,
        saleClosedSource: 'auto',
        updatedAt:        serverTimestamp(),
      });
      showToast('Reset to automatic detection', 'success');
    } catch (err) {
      console.error('[resetSaleClosedToAuto] failed:', err);
      void logError('taskActions.resetSaleClosedToAuto', err, { taskId });
      showToast('Failed to reset. Try again.', 'error');
      throw err;
    }
  }

  return { createTask, assignTask, archiveTask, unarchiveTask, updateTaskTitle, updateTaskDueDate, updateTaskDescription, updateTaskConsumerMobile, updateTaskDistrict, updateTaskLeadSource, setSaleClosedManual, resetSaleClosedToAuto };
}
