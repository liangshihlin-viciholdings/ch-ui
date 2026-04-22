import { toast as sonnerToast, ExternalToast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Info, Undo2 } from "lucide-react";
import { createElement } from "react";

/**
 * Enhanced toast notification options
 */
export interface EnhancedToastOptions extends ExternalToast {
  /** Show undo button (for non-destructive operations) */
  showUndo?: boolean;

  /** Callback when undo is clicked */
  onUndo?: () => void | Promise<void>;

  /** Operation details to show in toast */
  details?: string;

  /** Toast group ID for grouping related notifications */
  groupId?: string;

  /** Make toast persist until manually dismissed */
  persist?: boolean;
}

/**
 * Toast notification result with undo metadata
 */
export interface ToastResult {
  /** Toast ID for programmatic dismissal */
  id: string | number;

  /** Dismiss this specific toast */
  dismiss: () => void;
}

/**
 * Hook for enhanced toast notifications with undo capability
 */
export function useEnhancedToast() {
  /**
   * Show success toast with optional undo
   */
  const success = (
    message: string,
    options: EnhancedToastOptions = {}
  ): ToastResult => {
    const { showUndo, onUndo, details, persist, ...sonnerOptions } = options;

    const action = showUndo && onUndo
      ? {
          label: "Undo",
          onClick: async () => {
            try {
              await onUndo();
              sonnerToast.success("Change reverted", {
                duration: 2000,
              });
            } catch (error) {
              sonnerToast.error(
                `Failed to undo: ${error instanceof Error ? error.message : "Unknown error"}`
              );
            }
          },
        }
      : undefined;

    const description = details ? details : undefined;

    const id = sonnerToast.success(message, {
      ...sonnerOptions,
      description,
      action,
      duration: persist ? Infinity : sonnerOptions.duration || 4000,
      classNames: {
        ...sonnerOptions.classNames,
        actionButton: "bg-green-600 hover:bg-green-700 text-white",
      },
    });

    return {
      id,
      dismiss: () => sonnerToast.dismiss(id),
    };
  };

  /**
   * Show error toast with context
   */
  const error = (
    message: string,
    options: EnhancedToastOptions = {}
  ): ToastResult => {
    const { details, persist, ...sonnerOptions } = options;

    const description = details ? details : undefined;

    const id = sonnerToast.error(message, {
      ...sonnerOptions,
      description,
      duration: persist ? Infinity : sonnerOptions.duration || 6000,
      classNames: {
        ...sonnerOptions.classNames,
        toast: "border-red-500/50 bg-red-500/10",
      },
    });

    return {
      id,
      dismiss: () => sonnerToast.dismiss(id),
    };
  };

  /**
   * Show warning toast
   */
  const warning = (
    message: string,
    options: EnhancedToastOptions = {}
  ): ToastResult => {
    const { details, persist, ...sonnerOptions } = options;

    const description = details ? details : undefined;

    const id = sonnerToast.warning(message, {
      ...sonnerOptions,
      description,
      duration: persist ? Infinity : sonnerOptions.duration || 5000,
      classNames: {
        ...sonnerOptions.classNames,
        toast: "border-yellow-500/50 bg-yellow-500/10",
      },
    });

    return {
      id,
      dismiss: () => sonnerToast.dismiss(id),
    };
  };

  /**
   * Show info toast
   */
  const info = (
    message: string,
    options: EnhancedToastOptions = {}
  ): ToastResult => {
    const { details, persist, ...sonnerOptions } = options;

    const description = details ? details : undefined;

    const id = sonnerToast.info(message, {
      ...sonnerOptions,
      description,
      duration: persist ? Infinity : sonnerOptions.duration || 4000,
      classNames: {
        ...sonnerOptions.classNames,
        toast: "border-blue-500/50 bg-blue-500/10",
      },
    });

    return {
      id,
      dismiss: () => sonnerToast.dismiss(id),
    };
  };

  /**
   * Show loading toast (dismissible)
   */
  const loading = (
    message: string,
    options: EnhancedToastOptions = {}
  ): ToastResult => {
    const { details, ...sonnerOptions } = options;

    const description = details ? details : undefined;

    const id = sonnerToast.loading(message, {
      ...sonnerOptions,
      description,
    });

    return {
      id,
      dismiss: () => sonnerToast.dismiss(id),
    };
  };

  /**
   * Show promise toast (automatically handles loading/success/error states)
   */
  const promise = <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    },
    options: EnhancedToastOptions = {}
  ): Promise<T> => {
    const { showUndo, onUndo, ...sonnerOptions } = options;

    const promiseWithToast = sonnerToast.promise(promise, {
      loading: messages.loading,
      success: (data) => {
        const message =
          typeof messages.success === "function"
            ? messages.success(data)
            : messages.success;
        return message;
      },
      error: (error) => {
        const message =
          typeof messages.error === "function"
            ? messages.error(error)
            : messages.error;
        return message;
      },
      ...sonnerOptions,
    });

    // If undo is requested, add it after success
    if (showUndo && onUndo) {
      promise.then(() => {
        const message =
          typeof messages.success === "function"
            ? "Operation completed"
            : messages.success;
        success(message, { showUndo, onUndo });
      });
    }

    return promise;
  };

  /**
   * Dismiss all toasts
   */
  const dismissAll = () => {
    sonnerToast.dismiss();
  };

  /**
   * Dismiss specific toast by ID
   */
  const dismiss = (id: string | number) => {
    sonnerToast.dismiss(id);
  };

  /**
   * Custom toast with full control
   */
  const custom = (
    component: React.ReactElement,
    options: EnhancedToastOptions = {}
  ): ToastResult => {
    const id = sonnerToast.custom(() => component, options);

    return {
      id,
      dismiss: () => sonnerToast.dismiss(id),
    };
  };

  /**
   * Show grouped notification (multiple items)
   */
  const group = (
    title: string,
    items: string[],
    type: "success" | "error" | "warning" | "info" = "info",
    options: EnhancedToastOptions = {}
  ): ToastResult => {
    const description = items.map((item, i) => `• ${item}`).join("\n");

    const toastFn = {
      success,
      error,
      warning,
      info,
    }[type];

    return toastFn(title, {
      ...options,
      details: description,
    });
  };

  return {
    success,
    error,
    warning,
    info,
    loading,
    promise,
    custom,
    group,
    dismiss,
    dismissAll,
  };
}

/**
 * Standalone enhanced toast utilities (for use outside of React components)
 */
export const enhancedToast = {
  success: (message: string, options: EnhancedToastOptions = {}) => {
    const { showUndo, onUndo, details, persist, ...sonnerOptions } = options;

    const action = showUndo && onUndo
      ? {
          label: "Undo",
          onClick: async () => {
            try {
              await onUndo();
              sonnerToast.success("Change reverted", { duration: 2000 });
            } catch (error) {
              sonnerToast.error(
                `Failed to undo: ${error instanceof Error ? error.message : "Unknown error"}`
              );
            }
          },
        }
      : undefined;

    return sonnerToast.success(message, {
      ...sonnerOptions,
      description: details,
      action,
      duration: persist ? Infinity : sonnerOptions.duration || 4000,
    });
  },

  error: (message: string, options: EnhancedToastOptions = {}) => {
    return sonnerToast.error(message, {
      ...options,
      description: options.details,
      duration: options.persist ? Infinity : options.duration || 6000,
    });
  },

  warning: (message: string, options: EnhancedToastOptions = {}) => {
    return sonnerToast.warning(message, {
      ...options,
      description: options.details,
      duration: options.persist ? Infinity : options.duration || 5000,
    });
  },

  info: (message: string, options: EnhancedToastOptions = {}) => {
    return sonnerToast.info(message, {
      ...options,
      description: options.details,
      duration: options.persist ? Infinity : options.duration || 4000,
    });
  },

  loading: (message: string, options: EnhancedToastOptions = {}) => {
    return sonnerToast.loading(message, {
      ...options,
      description: options.details,
    });
  },

  dismissAll: () => sonnerToast.dismiss(),
  dismiss: (id: string | number) => sonnerToast.dismiss(id),
};
