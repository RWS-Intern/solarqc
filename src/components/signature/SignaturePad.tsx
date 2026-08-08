import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Point { x: number; y: number }
type Stroke = Point[];

interface SignaturePadProps {
  onConfirm:     (blob: Blob) => void | Promise<void>;
  disabled?:     boolean;
  confirmLabel?: string;
}

const MIN_STROKES     = 2;
const MIN_PATH_LENGTH = 50; // px — stops an accidental single-dot "signature"

export function SignaturePad({ onConfirm, disabled, confirmLabel = 'Confirm' }: SignaturePadProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const [strokeCount, setStrokeCount] = useState(0); // forces a re-render for button state
  const [confirming,  setConfirming]  = useState(false);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  // Backing store scaled to devicePixelRatio, or this renders blurry on
  // phones — the CSS size stays fixed, only the pixel buffer scales.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = getCtx();
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#1e293b';
    }
  }, []);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = pointFromEvent(e);
    strokesRef.current = [...strokesRef.current, [pt]];
    const ctx = getCtx();
    ctx?.beginPath(); ctx?.moveTo(pt.x, pt.y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const pt = pointFromEvent(e);
    strokesRef.current[strokesRef.current.length - 1].push(pt);
    const ctx = getCtx();
    ctx?.lineTo(pt.x, pt.y); ctx?.stroke();
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setStrokeCount(strokesRef.current.length);
  }

  function redraw() {
    const canvas = canvasRef.current, ctx = getCtx();
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath(); ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const pt of stroke.slice(1)) ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  }

  function handleClear() {
    strokesRef.current = []; setStrokeCount(0); redraw();
  }

  function handleUndo() {
    // Canvas has no native undo — trim the stroke history and replay
    // everything that's left. Cheap at this scale (a handful of strokes).
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    redraw();
  }

  function totalPathLength(): number {
    let total = 0;
    for (const stroke of strokesRef.current) {
      for (let i = 1; i < stroke.length; i++) {
        const dx = stroke[i].x - stroke[i - 1].x;
        const dy = stroke[i].y - stroke[i - 1].y;
        total += Math.sqrt(dx * dx + dy * dy);
      }
    }
    return total;
  }

  const isEmpty = strokeCount < MIN_STROKES || totalPathLength() < MIN_PATH_LENGTH;

  async function handleConfirm() {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    setConfirming(true);
    canvas.toBlob(async (blob) => {
      if (!blob) { setConfirming(false); return; }
      try { await onConfirm(blob); } finally { setConfirming(false); }
    }, 'image/png');
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        style={{ touchAction: 'none', width: '100%', height: '160px' }}
        className={cn(
          'rounded-lg border-2 border-dashed border-gray-200 bg-white',
          disabled && 'opacity-50 pointer-events-none',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={handleUndo}  disabled={disabled || strokeCount === 0}>Undo</Button>
        <Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={disabled || strokeCount === 0}>Clear</Button>
        <Button type="button" size="sm" onClick={handleConfirm} disabled={disabled || isEmpty || confirming}>
          {confirming ? 'Uploading…' : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
