import { useEffect, useState } from "react";
import { Modal } from "./Overlay";
import { Button } from "./Button";
import { Field, Input } from "./primitives";

export function NameDialog({ open, title, initial, onClose, onSave, label }: { open: boolean; title: string; initial: string; label: string; onClose: () => void; onSave: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial, open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (value.trim()) onSave(value.trim());
              onClose();
            }}
            disabled={!value.trim()}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSave(value.trim());
          onClose();
        }}
      >
        <Field label={label}>{(id) => <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} maxLength={140} data-autofocus />}</Field>
      </form>
    </Modal>
  );
}
