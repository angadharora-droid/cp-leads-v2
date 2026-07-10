import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Confirmation dialog. Controlled via `open`/`onOpenChange`. The confirm
 * handler may be async; a spinner shows while it is pending.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {() => void | Promise<void>} props.onConfirm
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} [props.description]
 * @param {string} [props.confirmText]
 * @param {string} [props.cancelText]
 * @param {'default'|'destructive'} [props.variant] confirm button variant
 */
function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'destructive',
}) {
  const [isPending, setIsPending] = useState(false);

  async function handleConfirm() {
    try {
      setIsPending(true);
      await onConfirm?.();
      onOpenChange?.(false);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange?.(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="mt-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange?.(false)}
            disabled={isPending}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? <Spinner size="sm" className="text-current" /> : null}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmDialog };
export default ConfirmDialog;
