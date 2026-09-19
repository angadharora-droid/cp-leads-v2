import { forwardRef, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackdropOnlyDismiss, useContentRef } from '@/components/ui/dialog';

/**
 * Side panel: a dialog anchored to the right edge of the screen, full height,
 * about 78% of the width on desktop (full width on phones), sliding in from
 * the right with the page dimmed behind it. Header and footer stay put; the
 * body scrolls. Built on Radix Dialog, so Esc, the X and a click on the
 * dimmed area all close it.
 */
const SidePanel = DialogPrimitive.Root;
const SidePanelTrigger = DialogPrimitive.Trigger;
const SidePanelClose = DialogPrimitive.Close;

const SidePanelOverlay = forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
SidePanelOverlay.displayName = 'SidePanelOverlay';

const SidePanelContent = forwardRef(({ className, children, onPointerDownOutside, ...props }, ref) => {
  const overlayRef = useRef(null);
  const [contentRef, setContentRef] = useContentRef(ref);
  // Only a press on the dimmed backdrop closes the panel (see dialog.jsx).
  const backdropOnly = useBackdropOnlyDismiss(overlayRef, contentRef);
  return (
  <DialogPrimitive.Portal>
    <SidePanelOverlay ref={overlayRef} />
    <DialogPrimitive.Content
      ref={setContentRef}
      onPointerDownOutside={(e) => {
        backdropOnly(e);
        onPointerDownOutside?.(e);
      }}
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l bg-card shadow-elevated outline-none',
        'sm:w-[78vw] sm:max-w-[1400px]',
        'data-[state=open]:animate-panel-in-right data-[state=closed]:animate-panel-out-right',
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
  </DialogPrimitive.Portal>
  );
});
SidePanelContent.displayName = 'SidePanelContent';

const SidePanelHeader = ({ className, ...props }) => (
  <div className={cn('flex flex-col space-y-1.5 border-b px-6 py-4 pr-12', className)} {...props} />
);
SidePanelHeader.displayName = 'SidePanelHeader';

/** The scrolling middle of the panel. */
const SidePanelBody = ({ className, ...props }) => (
  <div className={cn('min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-5', className)} {...props} />
);
SidePanelBody.displayName = 'SidePanelBody';

const SidePanelFooter = ({ className, ...props }) => (
  <div
    className={cn('flex flex-col-reverse gap-2 border-t bg-card px-6 py-3 sm:flex-row sm:justify-end', className)}
    {...props}
  />
);
SidePanelFooter.displayName = 'SidePanelFooter';

const SidePanelTitle = forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
SidePanelTitle.displayName = 'SidePanelTitle';

const SidePanelDescription = forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
SidePanelDescription.displayName = 'SidePanelDescription';

export {
  SidePanel,
  SidePanelTrigger,
  SidePanelClose,
  SidePanelOverlay,
  SidePanelContent,
  SidePanelHeader,
  SidePanelBody,
  SidePanelFooter,
  SidePanelTitle,
  SidePanelDescription,
};
