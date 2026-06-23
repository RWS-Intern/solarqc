import { cn } from '@/lib/utils';
import { YesNoInput }        from './YesNoInput';
import { SelectInput }       from './SelectInput';
import { TextInput }         from './TextInput';
import { NumberInput }       from './NumberInput';
import { DateInput }         from './DateInput';
import { MeasurementInput }  from './MeasurementInput';
import { AgeInput }          from './AgeInput';
import { PhotoZone }         from '@/components/photos/PhotoZone';
import type { FieldDefinition } from '@/types';

interface ChecklistItemProps {
  field:          FieldDefinition;
  answer:         string | null;
  photos:         string[];
  onAnswerChange: (fieldId: string, value: string) => void;
  onPhotosChange: (fieldId: string, urls: string[]) => void;
  showError:      boolean;
  taskNum?:       string;
  disabled?:      boolean;
  engineerCode?:  string;
  engineerName?:  string;
}

export function ChecklistItem({
  field, answer, photos, onAnswerChange, onPhotosChange, showError, taskNum, disabled,
  engineerCode, engineerName,
}: ChecklistItemProps) {
  const isPhotoOnly  = field.type === 'photo_only';
  const isHeaderOnly = field.type === 'section_header';
  const hasAnswer    = !isHeaderOnly && answer !== null && answer !== '';
  const hasPhotos    = photos.length > 0;
  const isErrorState = !isHeaderOnly && showError && field.isRequired && !hasAnswer && !isPhotoOnly;
  const isPhotoError = !isHeaderOnly && showError && field.isRequired && isPhotoOnly && !hasPhotos;

  // Section header — styled divider, no input
  if (isHeaderOnly) {
    return (
      <div className="pt-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-[2px] bg-gray-400" />
          <span className="text-xs font-extrabold text-gray-700 uppercase tracking-widest whitespace-nowrap px-2">
            {field.label}
          </span>
          <div className="flex-1 h-[2px] bg-gray-400" />
        </div>
        {field.unit && (
          <p className="text-xs text-gray-400 text-center mt-1">{field.unit}</p>
        )}
      </div>
    );
  }

  const borderColour = (hasAnswer || hasPhotos)
    ? 'border-l-green-500'
    : (isErrorState || isPhotoError)
    ? 'border-l-brand-red'
    : 'border-l-gray-200';

  return (
    <div className={cn('rounded-lg border border-gray-100 bg-white p-3 border-l-4', borderColour)}>
      <p className="text-sm font-medium text-gray-800 mb-2">
        {field.label}
        {field.isRequired && <span className="text-brand-red ml-1" aria-hidden>*</span>}
      </p>

      {field.type === 'yesno' && (
        <YesNoInput value={answer} onChange={(v) => onAnswerChange(field.fieldId, v)} disabled={disabled} />
      )}
      {field.type === 'select' && (
        <SelectInput options={field.options ?? []} value={answer} onChange={(v) => onAnswerChange(field.fieldId, v)} disabled={disabled} />
      )}
      {field.type === 'text' && (
        <TextInput value={answer ?? ''} onChange={(v) => onAnswerChange(field.fieldId, v)} placeholder="Enter value…" disabled={disabled} />
      )}
      {field.type === 'number' && (
        <NumberInput value={answer ?? ''} onChange={(v) => onAnswerChange(field.fieldId, v)} placeholder="Enter number…" disabled={disabled} />
      )}
      {field.type === 'date' && (
        <DateInput value={answer ?? ''} onChange={(v) => onAnswerChange(field.fieldId, v)} disabled={disabled} />
      )}
      {field.type === 'measurement' && (
        <MeasurementInput
          value={answer ?? ''}
          onChange={(v) => onAnswerChange(field.fieldId, v)}
          unit={field.unit}
          disabled={disabled}
        />
      )}
      {field.type === 'age' && (
        <AgeInput
          value={answer ?? ''}
          onChange={(v) => onAnswerChange(field.fieldId, v)}
          disabled={disabled}
        />
      )}

      {field.type === 'photo_only' && (
        <div className="mt-2">
          <PhotoZone
            label="Photo"
            photos={photos}
            onPhotosChange={(urls) => onPhotosChange(field.fieldId, urls)}
            required={field.isRequired}
            maxPhotos={10}
            disabled={disabled}
            taskNum={taskNum}
            fieldId={field.fieldId}
            photoType="field"
            engineerCode={engineerCode}
            engineerName={engineerName}
            fieldLabel={field.label}
          />
        </div>
      )}
    </div>
  );
}
