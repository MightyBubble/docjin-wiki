import React, { useState, useEffect, useRef } from 'react';

interface ModalDialogProps {
  open: boolean;
  title: string;
  /** 'input' shows a text field; 'confirm' shows only message + buttons */
  mode: 'input' | 'confirm';
  /** Placeholder or message text */
  message?: string;
  /** Default value for input mode */
  defaultValue?: string;
  /** Label for confirm button */
  confirmLabel?: string;
  /** Use red styling for destructive actions */
  destructive?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
  open,
  ...props
}) => {
  if (!open) return null;

  return <ModalDialogInner key={`${props.title}:${props.defaultValue || ''}:${props.mode}`} {...props} />;
};

const ModalDialogInner: React.FC<Omit<ModalDialogProps, 'open'>> = ({
  title,
  mode,
  message = '',
  defaultValue = '',
  confirmLabel = 'OK',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== 'input') return;

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);

    return () => {
      window.clearTimeout(timer);
    };
  }, [mode]);

  const handleSubmit = () => {
    if (mode === 'input' && !value.trim()) return;
    onConfirm(value.trim());
  };

  const confirmBtnClass = destructive
    ? 'px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600'
    : 'px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 w-80" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-200">{title}</h3>
        {mode === 'confirm' && message && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{message}</p>
        )}
        {mode === 'input' && (
          <input
            ref={inputRef}
            className="w-full mb-3 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder={message}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); }}
          />
        )}
        <div className="flex justify-end space-x-2">
          <button
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button className={confirmBtnClass} onClick={handleSubmit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
