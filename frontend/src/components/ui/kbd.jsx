import { cn } from '@/lib/utils';

/** Keyboard-shortcut hint chip, e.g. <Kbd>Ctrl</Kbd><Kbd>K</Kbd>. */
function Kbd({ className, ...props }) {
  return <kbd className={cn('kbd', className)} {...props} />;
}

export { Kbd };
export default Kbd;
