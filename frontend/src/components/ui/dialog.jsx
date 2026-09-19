import { forwardRef, useCallback, useEffect, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * A dialog closes on an outside press only when that press is on its own
 * dimmed backdrop, and only when nothing else was open above the dialog at
 * the time. Esc and the X still close it.
 *
 * Why the second condition: while a Select list (or a nested dialog) is open,
 * Radix makes the dialog body pointer-inert but leaves the backdrop clickable,
 * so a press anywhere on the form lands on the backdrop. Radix Dialog then
 * decides "outside press" on the following click, by which time the list has
 * already closed — so the backdrop target alone cannot tell "clicked the dim
 * strip" from "clicked the form to close a dropdown". The body's inline
 * `pointer-events: none`, noted at press time, settles it.
 *
 * @param {React.RefObject<HTMLElement>} overlayRef the dialog's backdrop
 * @param {React.RefObject<HTMLElement>} contentRef the dialog's content box
 */
export function useBackdropOnlyDismiss(overlayRef, contentRef) {
  const coveredAtPressRef = useRef(false);

  useEffect(() => {
    const notePress = () => {
      coveredAtPressRef.current = contentRef.current?.style.pointerEvents === 'none';
    };
    document.addEventListener('pointerdown', notePress, true);
    return () => document.removeEventListener('pointerdown', notePress, true);
  }, [contentRef]);

  return (event) => {
    if (coveredAtPressRef.current) {
      event.preventDefault();
      return;
    }
    const target = event.detail?.originalEvent?.target;
    const overlay = overlayRef.current;
    if (target && overlay && (target === overlay || overlay.contains(target))) return;
    event.preventDefault();
  };
}

/** A local ref to the content box that still honours the forwarded ref. */
export function useContentRef(forwardedRef) {
  const contentRef = useRef(null);
  const setContentRef = useCallback(
    (node) => {
      contentRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );
  return [contentRef, setContentRef];
}

const DialogContent = forwardRef(
  ({ className, children, onPointerDownOutside, ...props }, ref) => {
    const overlayRef = useRef(null);
    const [contentRef, setContentRef] = useContentRef(ref);
    const backdropOnly = useBackdropOnlyDismiss(overlayRef, contentRef);
    return (
    <DialogPortal>
      <DialogOverlay ref={overlayRef} />
      <DialogPrimitive.Content
        ref={setContentRef}
        onPointerDownOutside={(e) => {
          backdropOnly(e);
          onPointerDownOutside?.(e);
        }}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-xl translate-x-[-50%] translate-y-[-50%] gap-5 border bg-card p-5 shadow-elevated sm:p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md bg-muted/60 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
    );
  }
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }) => (
  <div
    className={cn('flex flex-col space-y-1.5 pr-6 text-left', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
