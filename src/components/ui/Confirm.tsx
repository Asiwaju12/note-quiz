import { useSyncExternalStore } from "react";
import { Modal } from "./Overlay";
import { Button } from "./Button";

type Request = { title: string; description?: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void };

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Promise-based confirmation dialog (replaces window.confirm with an accessible, themed modal). */
export function confirmAction(options: { title: string; description?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    current?.resolve(false);
    current = { title: options.title, description: options.description, confirmLabel: options.confirmLabel ?? "Confirm", danger: options.danger ?? false, resolve };
    emit();
  });
}

function close(ok: boolean) {
  current?.resolve(ok);
  current = null;
  emit();
}

export function ConfirmHost() {
  const request = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
  return (
    <Modal
      open={Boolean(request)}
      onClose={() => close(false)}
      title={request?.title}
      description={request?.description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={request?.danger ? "danger" : "primary"} onClick={() => close(true)} data-autofocus>
            {request?.confirmLabel}
          </Button>
        </>
      }
    >
      <span className="sr-only">{request?.title}</span>
    </Modal>
  );
}
