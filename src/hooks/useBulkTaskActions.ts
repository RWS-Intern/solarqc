import { useTaskActions }         from '@/hooks/useTaskActions';
import type { FieldEngineer }     from '@/hooks/useFieldEngineers';

export interface BulkTaskRow {
  title:          string;
  description:    string;
  consumerMobile: string;
  state?:         string;
  district?:      string;
  leadSource?:             string;
  leadSourceEmployeeName?: string;
  leadGeneratedByUid?:     string | null;
  leadGeneratedByName?:    string;
  engineer:       FieldEngineer | null;
  dueDate:        Date | null;
}

export function useBulkTaskActions() {
  const { createTask } = useTaskActions();

  async function createBulkTasks(
    rows: BulkTaskRow[],
    onProgress: (current: number, total: number) => void,
  ): Promise<{ succeeded: number; failed: number }> {
    const MAX_ROWS = 500;
    if (rows.length > MAX_ROWS) {
      throw new Error(`Maximum ${MAX_ROWS} rows per upload. Please split your file.`);
    }

    let succeeded = 0;
    let failed    = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      onProgress(i + 1, rows.length);
      try {
        await createTask({
          title:                   row.title,
          description:             row.description || undefined,
          consumerMobile:          row.consumerMobile,
          state:                   row.state    || undefined,
          district:                row.district || undefined,
          leadSource:              row.leadSource,
          leadSourceEmployeeName:  row.leadSourceEmployeeName,
          leadGeneratedByUid:      row.leadGeneratedByUid,
          leadGeneratedByName:     row.leadGeneratedByName,
          assignedTo:     row.engineer?.uid          ?? null,
          assignedToName: row.engineer?.displayName  ?? '',
          assignedToCode: row.engineer?.engineerCode ?? '',
          dueDate:        row.dueDate,
        });
        succeeded++;
      } catch {
        failed++;
      }
    }

    return { succeeded, failed };
  }

  return { createBulkTasks };
}
