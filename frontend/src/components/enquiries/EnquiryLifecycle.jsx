import { useEffect, useState } from 'react';
import { Clock, Route } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { stageInfo } from '@/lib/enquiryStages';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function daysLabel(days) {
  if (days === null || days === undefined) return '';
  if (days === 0) return 'under a day';
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * The life cycle of one enquiry: a block for every stage it reached, in
 * order, each filled with the facts of that stage — document numbers, who
 * they went to, who signed and how, the advance or credit that won it, why
 * it was lost or cancelled — with the days spent in each stage and what
 * happened while it was there.
 *
 * @param {object} props
 * @param {string} props.enquiryId
 * @param {string|number} [props.version] changes whenever the enquiry does, to reload
 */
export default function EnquiryLifecycle({ enquiryId, version }) {
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-primary" />
            Life cycle
          </CardTitle>
          {summary ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {summary.open
                ? `Open for ${daysLabel(summary.totalDays)}`
                : `${summary.stageLabel} after ${daysLabel(summary.totalDays)}`}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <ol className="relative space-y-5">
            {data.blocks.map((block, i) => {
              const info = stageInfo(block.stage);
              const last = i === data.blocks.length - 1;
              return (
                <li key={`${block.stage}-${i}`} className="relative pl-7">
                  {/* The rail joining one stage to the next. */}
                  {!last ? <span className="absolute left-[7px] top-5 h-[calc(100%+0.5rem)] w-px bg-border" aria-hidden="true" /> : null}
                  <span
                    className={cn('absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-2 border-background', block.current && 'ring-2 ring-offset-1')}
                    style={{ backgroundColor: info.color, '--tw-ring-color': info.color }}
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {block.label}
                      {block.current ? <span className="ml-2 text-xs font-medium text-muted-foreground">current stage</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {block.at ? formatDateTime(block.at) : ''}
                      {block.byName ? ` · ${block.byName}` : ''}
                      {block.days !== null && block.days !== undefined ? ` · ${daysLabel(block.days)} in this stage` : ''}
                    </p>
                  </div>

                  {block.facts.length ? (
                    <dl className="mt-2 grid gap-x-6 gap-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                      {block.facts.map((fact) => (
                        <div key={fact.label} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                          <dd className="break-words font-medium text-foreground">{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {block.events.length ? (
                    <ul className="mt-2 space-y-1">
                      {block.events.map((event, j) => (
                        <li key={j} className="flex gap-2 text-xs text-muted-foreground">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="text-foreground">{event.text}</span>
                            {' · '}
                            {formatDateTime(event.at)}
                            {event.byName ? ` · ${event.byName}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
