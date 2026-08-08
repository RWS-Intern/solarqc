import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface EvidenceGalleryProps {
  photos:     string[];
  startIndex: number;
  onClose:    () => void;
  location?:  { lat: number; lng: number; accuracy: number } | null;
}

export function EvidenceGallery({ photos, startIndex, onClose, location }: EvidenceGalleryProps) {
  const [index, setIndex] = useState(startIndex);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(photos.length - 1, i + 1)), [photos.length]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape')    onClose();
      if (e.key === 'ArrowLeft')  goPrev();
      if (e.key === 'ArrowRight') goNext();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, goPrev, goNext]);

  function handleTouchStart(e: React.TouchEvent) { setTouchStartX(e.touches[0].clientX); }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) { dx > 0 ? goPrev() : goNext(); } // 50px swipe threshold
    setTouchStartX(null);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-sm">Photo {index + 1} of {photos.length}</span>
        <button type="button" onClick={onClose} aria-label="Close"><X className="h-6 w-6" /></button>
      </div>
      <div className="flex-1 flex items-center justify-center relative px-4">
        {index > 0 && (
          <button type="button" onClick={goPrev} className="absolute left-2 text-white/70 hover:text-white" aria-label="Previous">
            <ChevronLeft className="h-8 w-8" />
          </button>
        )}
        <img src={photos[index]} alt={`Evidence ${index + 1}`} className="max-h-full max-w-full object-contain" />
        {index < photos.length - 1 && (
          <button type="button" onClick={goNext} className="absolute right-2 text-white/70 hover:text-white" aria-label="Next">
            <ChevronRight className="h-8 w-8" />
          </button>
        )}
      </div>
      {location && (
        <p className="text-center text-xs text-white/60 pb-4">
          Site GPS: {location.lat.toFixed(5)}, {location.lng.toFixed(5)} (±{Math.round(location.accuracy)}m)
        </p>
      )}
    </div>
  );
}
