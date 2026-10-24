// Photo dropzone for one panel: drag-and-drop plus a keyboard-reachable
// choose button. Client-side limits and every message are verbatim from
// public/app.js:85-121. Nothing leaves the page until the user presses Read.
import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { SourceImage } from '@/lib/types';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024;

export function Dropzone({
  id,
  label,
  buttonLabel,
  image,
  disabled,
  onLoaded,
  onCleared,
}: {
  id: string;
  label: string;
  buttonLabel: string;
  image: SourceImage | null;
  disabled?: boolean;
  onLoaded: (image: SourceImage) => void;
  onCleared: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('');

  function handleFile(file: File | undefined) {
    if (!file) {
      setStatus('');
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setStatus('That file type cannot be read here. Please use a PNG, JPEG, or WebP photo.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus('That image is larger than the 4 MB limit. Please pick a smaller photo.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onLoaded({
        mime: file.type,
        data: String(reader.result).split(',')[1] || '',
      });
      setStatus(
        'Photo ready: ' +
          file.name +
          ' (' +
          Math.max(1, Math.round(file.size / 1024)) +
          ' KB)',
      );
    };
    reader.onerror = () => {
      setStatus('The photo could not be opened. Please try another one.');
      if (inputRef.current) inputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFile(event.dataTransfer.files && event.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={id + '-label'} className="text-[13px] font-medium text-foreground">
        {label}
      </span>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="sr-only"
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => handleFile(event.target.files ? event.target.files[0] : undefined)}
      />

      {image ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 text-[13px] font-medium text-success">
            <ImagePlus aria-hidden="true" className="size-4" />
            Photo added
          </span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-1.5 px-3 text-[13px]"
            disabled={disabled}
            onClick={() => {
              onCleared();
              setStatus('');
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            <X aria-hidden="true" className="size-4" />
            Remove photo
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-label={buttonLabel}
          aria-describedby={id + '-hint'}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            'flex min-h-11 w-full cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed bg-card px-4 py-4 text-center transition-colors motion-reduce:transition-none',
            dragging
              ? 'border-ring bg-ring/10'
              : 'border-input bg-card/50 hover:border-ring hover:bg-ring/5',
            disabled ? 'cursor-not-allowed opacity-50' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <ImagePlus aria-hidden="true" className="size-5 text-info" />
          <span className="text-[14px] font-semibold text-foreground">
            Drag a photo here, or choose one
          </span>
          <span id={id + '-hint'} className="text-[12px] text-muted-foreground">
            PNG, JPEG, or WebP, up to 4 MB
          </span>
        </button>
      )}

      <p className="min-h-5 text-[12px] text-muted-foreground" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
