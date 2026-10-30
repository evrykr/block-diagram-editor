import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  message: string;
  tone?: 'success' | 'error' | 'info';
}

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div className="toast-viewport" aria-live="polite">
      {toasts.map((toast) => {
        const tone = toast.tone ?? 'info';
        return (
          <div className={`toast toast-${tone}`} key={toast.id}>
            <span className="toast-icon">
              {tone === 'success' ? (
                <CheckCircle2 size={18} />
              ) : tone === 'error' ? (
                <AlertTriangle size={18} />
              ) : (
                <Info size={18} />
              )}
            </span>
            <span>{toast.message}</span>
            <button onClick={() => onDismiss(toast.id)} aria-label="Закрыть">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
