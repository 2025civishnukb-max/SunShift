import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button, cn } from './ui';

/**
 * Roof photo upload for the Rooftop Estimator.
 * Accepts JPG / PNG / WEBP up to 5 MB, shows a preview with replace and remove
 * controls. The image never leaves the browser — it is a visual reference only;
 * the capacity estimate is computed purely from the form inputs.
 */

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_SIZE_MB = 5;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function RoofImageUpload({ className }: { className?: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL when it changes or on unmount.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFile = (file: File | undefined | null) => {
    if (!file) return;
    const looksAcceptable =
      ACCEPTED_TYPES.includes(file.type.toLowerCase()) ||
      ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!looksAcceptable) {
      setError(`"${file.name}" is not a supported image. Please choose a JPG, JPEG, PNG or WEBP file.`);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`"${file.name}" is ${formatSize(file.size)} — larger than the ${MAX_SIZE_MB} MB limit. Please choose a smaller image.`);
      return;
    }
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    setFileSize(file.size);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    e.target.value = ''; // allow re-selecting the same file to replace
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const remove = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName(null);
    setFileSize(null);
    setError(null);
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={onInputChange}
        aria-label="Upload roof photo"
      />

      {preview ? (
        <div>
          <div className="relative overflow-hidden rounded-xl border border-line">
            <img src={preview} alt={`Preview of uploaded roof photo ${fileName ?? ''}`} className="max-h-56 w-full object-cover" />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11.5px] text-muted" title={fileName ?? undefined}>
              {fileName}
              {fileSize != null ? <span className="text-faint"> · {formatSize(fileSize)}</span> : null}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                <ImagePlus size={13} /> Replace
              </Button>
              <Button variant="danger" size="sm" onClick={remove}>
                <Trash2 size={13} /> Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload roof photo"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-7 text-center transition-colors',
            dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-panel-2/40 hover:border-white/20',
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-[#8fa7ff]">
            <ImagePlus size={18} />
          </span>
          <p className="mt-2.5 text-[13px] font-semibold text-ink">Upload roof photo</p>
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            Drag &amp; drop or click to browse · JPG, PNG or WEBP · up to {MAX_SIZE_MB} MB
          </p>
        </div>
      )}

      {error ? (
        <p className="mt-2.5 rounded-xl border border-danger/40 bg-danger-soft p-3 text-[12px] font-medium leading-relaxed text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
          Reference only — the photo stays in your browser and is not analysed or uploaded. The estimate uses the inputs above.
        </p>
      )}
    </div>
  );
}
