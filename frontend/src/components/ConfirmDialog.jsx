import { useState } from 'react';
import { toast } from 'sonner';

import { getErrorMessage } from '@/lib/api';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
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
 * handler may be async; a spinner shows while it is pending and the dialog
 * cannot be dismissed until it settles.
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
 * @param {React.ComponentType<{ className?: string }>|null} [props.icon]
 *   lucide icon shown in a tinted circle above the title. Defaults to
 *   AlertTriangle for the destructive variant; pass `null` to hide it.
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
  icon,
}) {
  const [isPending, setIsPending] = useState(false);
  const Icon = icon === undefined ? (variant === 'destructive' ? AlertTriangle : null) : icon;
  const destructive = variant === 'destructive';

  // A failed action is reported here, and the dialog stays open, so no
  // confirm ever fails silently.
  async function handleConfirm() {
    try {
      setIsPending(true);
      await onConfirm?.();
      onOpenChange?.(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Action failed'));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange?.(next)}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader className="items-center text-center sm:items-start sm:text-left">
          {Icon ? (
            <div
              className={cn(
                'mb-1 flex h-11 w-11 items-center justify-center rounded-full',
                destructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
              )}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="leading-relaxed">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="mt-2 gap-2 sm:space-x-0">
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
