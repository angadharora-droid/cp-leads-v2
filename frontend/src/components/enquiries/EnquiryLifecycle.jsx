import { useEffect, useState } from 'react';
import { ArrowRightCircle, Clock, FileDiff, Mail, PenLine, Route } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { stageInfo } from '@/lib/enquiryStages';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function daysLabel(days) {
  if (days === null || days === undefined) return '';
  if (days === 0) return 'under a day';
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** "Open for 12 days", "Won after 10 days", "Lost within a day". */
function summaryLabel(summary) {
  if (summary.open) return `Open for ${daysLabel(summary.totalDays)}`;
  if (!summary.totalDays) return `${summary.stageLabel} within a day`;
  return `${summary.stageLabel} after ${daysLabel(summary.totalDays)}`;
}

const EVENT_ICONS = {
  email: Mail,
  revision: FileDiff,
  signature: PenLine,
  stage: ArrowRightCircle,
};

/**
 * The life cycle of one enquiry: a block for every stage it reached, in
 * order, each with the facts of that stage — document numbers, who they went
 * to, who signed and how, the advance or credit that won it, why it was lost
 * or cancelled — the days spent there, and what happened while it was there:
 * emails, edits (with what changed), signatures, moves. Every time is hotel
 * time, formatted by the server, so the card reads the same everywhere.
 *
 * @param {object} props
 * @param {string} props.enquiryId
 * @param {string|number} [props.version] changes whenever the enquiry does, to reload
 * @param {boolean} [props.compact] the card sits in a narrow column: facts stack in one column
 * @param {boolean} [props.bare] no card around it (it sits inside a panel that has its own title)
 */
export default function EnquiryLifecycle({ enquiryId, version, compact = false, bare = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get(`/enquiries/${enquiryId}/lifecycle`)
      .then((res) => {
        if (!active) return;
        setData(res?.data?.data || null);
        setError('');
      })
      .catch((err) => active && setError(getErrorMessage(err, 'Could not load the life cycle')));
    return () => {
      active = false;
    };
  }, [enquiryId, version]);

  const summary = data?.summary;
  const summaryNode = summary ? (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {summaryLabel(summary)}
    </p>
  ) : null;

  const body = (
    <>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <ol className="relative space-y-6">
            {data.blocks.map((block, i) => {
              const info = stageInfo(block.stage);
              const last = i === data.blocks.length - 1;
              const stay = block.days === null || block.days === undefined ? '' : block.current ? `${daysLabel(block.days)} so far` : `${daysLabel(block.days)} here`;
              return (
                <li key={`${block.stage}-${i}`} className="relative pl-7">
                  {/* The rail joining one stage to the next. */}
                  {!last ? <span className="absolute left-[7px] top-5 h-[calc(100%+0.75rem)] w-px bg-border" aria-hidden="true" /> : null}
                  <span
                    className={cn('absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-2 border-background', block.current && 'ring-2 ring-offset-1')}
                    style={{ backgroundColor: info.color, '--tw-ring-color': info.color }}
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{block.label}</p>
                      {block.current ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Current stage</span>
                      ) : null}
                      {stay ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{stay}</span> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {block.atLabel}
                      {block.byName ? ` · ${block.byName}` : ''}
                    </p>
                  </div>

                  {block.facts.length ? (
                    <dl className={cn('mt-2 grid gap-x-6 gap-y-2 rounded-lg border bg-muted/30 p-3 text-sm', !compact && 'sm:grid-cols-2')}>
                      {block.facts.map((fact) => (
                        <div key={fact.label} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                          <dd className="break-words font-medium text-foreground">{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {block.events.length ? (
                    <ul className="mt-2.5 space-y-1.5">
                      {block.events.map((event, j) => {
                        const Icon = EVENT_ICONS[event.kind] || ArrowRightCircle;
                        return (
                          <li key={j} className="flex gap-2 text-xs text-muted-foreground">
                            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              {/* In a narrow column the stamp takes its own line rather than forcing the width. */}
                              <p className="break-words">
                                <span className="text-foreground">{event.text}</span>
                                <span className={cn(compact ? 'block' : 'inline')}>
                                  {compact ? '' : ' · '}
                                  {event.atLabel}
                                  {event.byName ? ` · ${event.byName}` : ''}
                                </span>
                              </p>
                              {event.details?.length ? (
                                <ul className="mt-1 space-y-0.5 border-l-2 border-border pl-2.5">
                                  {event.details.map((line, k) => (
                                    <li key={k} className="text-foreground/80">
                                      {line}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
    </>
  );

  if (bare) {
    return (
      <div className="space-y-4">
        {summaryNode}
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-primary" />
            Life cycle
          </CardTitle>
          {summaryNode}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
