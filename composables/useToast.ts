import { ref } from 'vue';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
  duration?: number;
}

const toasts = ref<ToastMessage[]>([]);

export function useToast() {
  const show = (message: string, type: ToastMessage['type'] = 'info', title?: string, duration = 3000) => {
    const id = Math.random().toString(36).slice(2, 9);
    const toast: ToastMessage = { id, type, title, message, duration };
    toasts.value.push(toast);

    if (duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, duration);
    }
    return id;
  };

  const success = (message: string, title?: string) => show(message, 'success', title);
  const error = (message: string, title?: string) => show(message, 'error', title, 4000);
  const info = (message: string, title?: string) => show(message, 'info', title);
  const warning = (message: string, title?: string) => show(message, 'warning', title);

  const dismiss = (id: string) => {
    const idx = toasts.value.findIndex(t => t.id === id);
    if (idx !== -1) {
      toasts.value.splice(idx, 1);
    }
  };

  return {
    toasts,
    show,
    success,
    error,
    info,
    warning,
    dismiss
  };
}
