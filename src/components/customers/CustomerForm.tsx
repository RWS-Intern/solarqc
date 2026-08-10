import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { StateCombobox }    from '@/components/ui/StateCombobox';
import { DistrictCombobox } from '@/components/ui/DistrictCombobox';
import { useUserStore } from '@/store/userStore';
import { useQcJobActions } from '@/hooks/useQcJobActions';
import { nameSearchFields } from '@/hooks/useCustomerImport';
import { resolveAndAutoAddStateDistrict } from '@/utils/districtUtils';
import { checkDuplicateCustomerMobile } from '@/utils/checkDuplicateMobile';
import { db } from '@/firebase/config';
import { useToast } from '@/components/ui/toast';
import type { QcJob } from '@/types/qc';

interface CustomerFormProps {
  open:    boolean;
  onClose: () => void;
}

const SYSTEM_TYPES: { value: NonNullable<QcJob['system']['systemType']>; label: string }[] = [
  { value: 'ongrid',  label: 'On-grid'  },
  { value: 'hybrid',  label: 'Hybrid'   },
  { value: 'offgrid', label: 'Off-grid' },
];

export function CustomerForm({ open, onClose }: CustomerFormProps) {
  const { createQcJob } = useQcJobActions();
  const { users } = useUserStore();
  const { showToast } = useToast();
  const activeInspectors = users.filter((u) => u.role === 'qc_inspector' && u.active);

  const [name,          setName]          = useState('');
  const [mobile,        setMobile]        = useState('');
  const [altMobile,     setAltMobile]     = useState('');
  const [address,       setAddress]       = useState('');
  const [state,         setState]         = useState('');
  const [district,      setDistrict]      = useState('');
  const [pincode,       setPincode]       = useState('');
  const [salesRef,      setSalesRef]      = useState('');
  const [lat,           setLat]           = useState('');
  const [lng,           setLng]           = useState('');
  const [sizeKw,        setSizeKw]        = useState('');
  const [moduleMake,    setModuleMake]    = useState('');
  const [inverterMake,  setInverterMake]  = useState('');
  const [inverterModel, setInverterModel] = useState('');
  const [systemType,    setSystemType]    = useState<string>('');
  const [installationDate, setInstallationDate] = useState('');
  const [installerCrew,    setInstallerCrew]     = useState('');
  const [inspectorUid,     setInspectorUid]      = useState<string>('');
  const [scheduledDate,    setScheduledDate]     = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [createdNum, setCreatedNum] = useState<string | null>(null);

  const mobileDigits = mobile.replace(/\D/g, '');
  const mobileError  = mobile.length > 0 && mobileDigits.length !== 10;
  const sizeKwNum    = Number(sizeKw);
  const sizeError    = sizeKw.length > 0 && (Number.isNaN(sizeKwNum) || sizeKwNum <= 0);
  const latNum       = Number(lat);
  const lngNum       = Number(lng);
  const latError     = lat.length > 0 && (Number.isNaN(latNum) || latNum < -90 || latNum > 90);
  const lngError     = lng.length > 0 && (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180);
  const canSubmit    = name.trim() && !mobileError && mobileDigits.length === 10
    && state.trim() && district.trim() && sizeKw.length > 0 && !sizeError
    && !latError && !lngError;

  // Same address+district+state string §4's directionsUrl() falls back to
  // when a job has no coordinates yet — reusing it here means whoever's
  // entering the customer searches on exactly what the inspector would
  // later see as the fallback destination, not just the bare street address.
  const mapsQuery = [address.trim(), district.trim(), state.trim()].filter(Boolean).join(', ');
  const mapsSearchUrl = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : null;

  function reset() {
    setName(''); setMobile(''); setAltMobile(''); setAddress(''); setState(''); setDistrict('');
    setPincode(''); setSalesRef(''); setLat(''); setLng(''); setSizeKw(''); setModuleMake(''); setInverterMake('');
    setInverterModel(''); setSystemType(''); setInstallationDate(''); setInstallerCrew('');
    setInspectorUid(''); setScheduledDate(''); setSubmitting(false); setCreatedNum(null);
  }

  function handleClose() {
    if (!submitting) { reset(); onClose(); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const dup = await checkDuplicateCustomerMobile(mobileDigits);
      if (dup) {
        showToast(`Mobile ${mobileDigits} already exists on job ${dup.qcNum} (${dup.name}).`, 'error');
        setSubmitting(false);
        return;
      }

      const { resolvedState, resolvedDistrict } = await resolveAndAutoAddStateDistrict(db, state, district);
      const { nameLower, nameWords } = nameSearchFields(name.trim());
      const inspector = inspectorUid
        ? (() => {
            const u = activeInspectors.find((i) => i.id === inspectorUid);
            return u ? { uid: u.id, name: u.name, code: u.engineerCode ?? '', mobile: u.mobileNumber ?? '' } : null;
          })()
        : null;

      const jobId = await createQcJob({
        customer: {
          name: name.trim(), nameLower, nameWords,
          mobile: mobileDigits,
          altMobile: altMobile.trim() || undefined,
          address: address.trim(),
          district: resolvedDistrict,
          state: resolvedState,
          pincode: pincode.trim() || undefined,
          salesRef: salesRef.trim() || undefined,
          location: (lat.trim() && lng.trim() && !latError && !lngError)
            ? { lat: latNum, lng: lngNum }
            : undefined,
        },
        system: {
          sizeKw: sizeKwNum,
          moduleMake: moduleMake.trim() || undefined,
          inverterMake: inverterMake.trim() || undefined,
          inverterModel: inverterModel.trim() || undefined,
          installationDate: installationDate || undefined,
          installerCrew: installerCrew.trim() || undefined,
          systemType: (systemType as QcJob['system']['systemType']) || undefined,
        },
        inspector,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      });
      void jobId;
      setCreatedNum('created');
      showToast('QC job created successfully.', 'success');
    } catch (err) {
      console.error('[CustomerForm] create failed:', err);
      showToast('Failed to create job. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent
        className="sm:max-w-lg max-h-[85vh] overflow-y-auto"
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add Customer &amp; Create QC Job</DialogTitle>
        </DialogHeader>

        {createdNum ? (
          <div className="flex flex-col items-center gap-4 mt-2 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-base font-semibold text-gray-800">QC job created.</p>
            <Button onClick={handleClose} className="w-full mt-1">Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-name">Customer name <span className="text-brand-red">*</span></Label>
              <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-mobile">Mobile <span className="text-brand-red">*</span></Label>
                <Input id="cf-mobile" type="tel" inputMode="numeric" maxLength={10} value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className={mobileError ? 'border-brand-red' : ''} required />
                {mobileError && <p className="text-xs text-brand-red">Must be exactly 10 digits</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-altmobile">Alt. mobile</Label>
                <Input id="cf-altmobile" type="tel" inputMode="numeric" maxLength={10} value={altMobile}
                  onChange={(e) => setAltMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-address">Address</Label>
              <Input id="cf-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>State <span className="text-brand-red">*</span></Label>
                <StateCombobox value={state} onChange={(v) => { setState(v); setDistrict(''); }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>District <span className="text-brand-red">*</span></Label>
                <DistrictCombobox value={district} onChange={setDistrict} state={state} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-pincode">Pincode</Label>
                <Input id="cf-pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-salesref">Sales ref.</Label>
                <Input id="cf-salesref" value={salesRef} onChange={(e) => setSalesRef(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Location (optional)</Label>
              {mapsSearchUrl && (
                <a
                  href={mapsSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-blue hover:underline"
                >
                  Look up on Google Maps
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-lat">Latitude</Label>
                <Input id="cf-lat" type="number" step="any" placeholder="e.g. 18.5204" value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className={latError ? 'border-brand-red' : ''} />
                {latError && <p className="text-xs text-brand-red">Must be between -90 and 90</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-lng">Longitude</Label>
                <Input id="cf-lng" type="number" step="any" placeholder="e.g. 73.8567" value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className={lngError ? 'border-brand-red' : ''} />
                {lngError && <p className="text-xs text-brand-red">Must be between -180 and 180</p>}
              </div>
            </div>

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">System</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-sizekw">System size (kW) <span className="text-brand-red">*</span></Label>
                <Input id="cf-sizekw" type="number" min={0} step="0.1" value={sizeKw}
                  onChange={(e) => setSizeKw(e.target.value)}
                  className={sizeError ? 'border-brand-red' : ''} required />
                {sizeError && <p className="text-xs text-brand-red">Must be a positive number</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>System type</Label>
                <Select value={systemType} onValueChange={setSystemType}>
                  <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                  <SelectContent>
                    {SYSTEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-modulemake">Module make</Label>
                <Input id="cf-modulemake" value={moduleMake} onChange={(e) => setModuleMake(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-invertermake">Inverter make</Label>
                <Input id="cf-invertermake" value={inverterMake} onChange={(e) => setInverterMake(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-invertermodel">Inverter model</Label>
                <Input id="cf-invertermodel" value={inverterModel} onChange={(e) => setInverterModel(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-installdate">Installation date</Label>
                <Input id="cf-installdate" type="date" value={installationDate} onChange={(e) => setInstallationDate(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-crew">Installer crew</Label>
              <Input id="cf-crew" value={installerCrew} onChange={(e) => setInstallerCrew(e.target.value)} />
            </div>

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">Assignment (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Assign inspector</Label>
                <Select value={inspectorUid} onValueChange={setInspectorUid}>
                  <SelectTrigger><SelectValue placeholder="— Unassigned —" /></SelectTrigger>
                  <SelectContent>
                    {activeInspectors.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name} ({u.engineerCode ?? '—'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-scheduled">Scheduled date</Label>
                <Input id="cf-scheduled" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={submitting || !canSubmit}>
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Creating…
                  </span>
                ) : 'Create Job'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
