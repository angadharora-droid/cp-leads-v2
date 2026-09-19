import {
  AlertTriangle,
  Ban,
  Bell,
  CalendarClock,
  ClipboardCheck,
  FileSignature,
  FileSpreadsheet,
  FolderKanban,
  KanbanSquare,
  PenLine,
  Receipt,
  RotateCcw,
  Send,
  Trophy,
  XCircle,
} from 'lucide-react';

/**
 * Window event fired whenever notifications change locally (read, all read),
 * so the bell and the Notifications page refresh together.
 */
export const NOTIFICATIONS_CHANGED = 'cph:notifications-changed';

export function emitNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

/** Icon and colour tone per notification type (kept in sync with the backend types). */
const VISUALS = {
  'lead.created': { icon: FolderKanban, tone: 'primary' },
  'lead.status': { icon: FolderKanban, tone: 'info' },
  'enquiry.created': { icon: KanbanSquare, tone: 'primary' },
  'enquiry.stage': { icon: KanbanSquare, tone: 'info' },
  'enquiry.won': { icon: Trophy, tone: 'success' },
  'enquiry.lost': { icon: XCircle, tone: 'destructive' },
  'enquiry.cancelled': { icon: Ban, tone: 'destructive' },
  'arc.created': { icon: FileSignature, tone: 'primary' },
  'arc.stage': { icon: FileSignature, tone: 'info' },
  'arc.lost': { icon: XCircle, tone: 'destructive' },
  'prospectus.created': { icon: FileSpreadsheet, tone: 'primary' },
  'prospectus.approved': { icon: ClipboardCheck, tone: 'success' },
  'prospectus.reopened': { icon: RotateCcw, tone: 'warning' },
  'estimate.created': { icon: Receipt, tone: 'primary' },
  'estimate.approved': { icon: ClipboardCheck, tone: 'success' },
  'estimate.reopened': { icon: RotateCcw, tone: 'warning' },
  'document.sent': { icon: Send, tone: 'info' },
  'document.signed': { icon: PenLine, tone: 'success' },
  'follow_up.due': { icon: CalendarClock, tone: 'warning' },
  'follow_up.overdue': { icon: AlertTriangle, tone: 'destructive' },
};

export const TONE_CLASSES = {
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
};

export function notificationVisual(type) {
  return VISUALS[type] || { icon: Bell, tone: 'primary' };
}
