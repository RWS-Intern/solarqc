// Shared by MyJobsPage's job cards and QcFillPage's header — one URL builder
// so the fallback behavior can't drift between the two call sites.
export function directionsUrl(customer: {
  address: string;
  district: string;
  state: string;
  location?: { lat: number; lng: number };
}): string {
  const destination = customer.location
    ? `${customer.location.lat},${customer.location.lng}`
    : encodeURIComponent(`${customer.address}, ${customer.district}, ${customer.state}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
