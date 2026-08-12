import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MapPin } from 'lucide-react';
import { useQcJob } from '@/hooks/useQcJob';
import { JobReadOnlyView } from '@/components/qc/JobReadOnlyView';
import { EvidenceGallery } from '@/components/qc/EvidenceGallery';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { directionsUrl } from '@/utils/directionsUrl';
import { QC_STATUS_LABELS, QC_STATUS_COLOR } from '@/config/qcStatus';
import { cn } from '@/lib/utils';

// admin/qc_manager/viewer only (App.tsx) — a job in ANY status, purely
// to look at what's there. No verdict actions, no signature capture, no
// edit controls anywhere: JobReadOnlyView's handlers are all no-ops, and
// firestore.rules independently denies these roles from writing
// answers/system.panels regardless of what this page does or doesn't
// expose.
export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { job, loading, error } = useQcJob(id);
  const [gallery, setGallery] = useState<{ photos: string[]; index: number } | null>(null);

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <p className="text-4xl">🔒</p>
        <h1 className="text-lg font-semibold text-gray-800">This job isn't available</h1>
        <p className="text-sm text-gray-500 max-w-xs">It may not exist, or you don't have access to it.</p>
        <Button variant="outline" onClick={() => navigate('/jobs')}>Back to Jobs</Button>
      </div>
    );
  }

  const statusColor = QC_STATUS_COLOR[job.status];

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-start gap-2 mb-4">
        <button type="button" onClick={() => navigate('/jobs')} aria-label="Back to Jobs" className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-700">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400">{job.qcNum}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusColor.bg, statusColor.text)}>
              {QC_STATUS_LABELS[job.status]}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-900 truncate">
            {job.customer.name}{job.system.sizeKw ? ` · ${job.system.sizeKw} kW` : ''}
          </p>
          <p className="text-xs text-gray-400">
            {job.customer.district}{job.customer.district && job.customer.state ? ', ' : ''}{job.customer.state}
            {job.inspectorName && <span className="ml-2 text-gray-500">→ {job.inspectorName}</span>}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {job.customer.mobile && (
            <a
              href={`tel:${job.customer.mobile}`}
              aria-label="Call customer"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:text-brand-blue hover:bg-blue-50 transition-colors"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          <a
            href={directionsUrl(job.customer)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Get directions"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:text-brand-blue hover:bg-blue-50 transition-colors"
          >
            <MapPin className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="pb-4">
        <JobReadOnlyView
          job={job}
          onPhotoClick={(_url, allUrls, index) => setGallery({ photos: allUrls, index })}
        />
      </div>

      {gallery && (
        <EvidenceGallery
          photos={gallery.photos}
          startIndex={gallery.index}
          onClose={() => setGallery(null)}
          location={job.location}
        />
      )}
    </div>
  );
}
