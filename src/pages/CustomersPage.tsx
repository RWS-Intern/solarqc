import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomerImportModal } from '@/components/customers/CustomerImportModal';
import { CustomerForm } from '@/components/customers/CustomerForm';

export function CustomersPage() {
  const navigate = useNavigate();
  const [showImport, setShowImport] = useState(false);
  const [showForm,   setShowForm]   = useState(false);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Customers</h1>
      <p className="text-sm text-gray-500 mb-5">
        Upload a closed sale to create a QC job. Uploading here doesn't create a separate
        customer record — the customer's details live directly on the QC job.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-5 text-left hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
            <Upload className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-gray-900">Import CSV</span>
          <span className="text-xs text-gray-500">Bulk-upload closed sales — up to 500 rows per file.</span>
        </button>

        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-5 text-left hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-brand-green">
            <UserPlus className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-gray-900">Add single customer</span>
          <span className="text-xs text-gray-500">Enter one closed sale and create its QC job directly.</span>
        </button>
      </div>

      <div className="mt-6">
        <Button variant="outline" onClick={() => navigate('/jobs')} className="text-sm">
          View all jobs →
        </Button>
      </div>

      <CustomerImportModal open={showImport} onClose={() => setShowImport(false)} />
      <CustomerForm open={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
}
