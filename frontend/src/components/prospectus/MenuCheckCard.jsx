import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const VERDICTS = {
  balanced: { label: 'Well balanced', tone: 'text-success bg-success/10 border-success/30' },
  needs_attention: { label: 'Needs attention', tone: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30' },
  unbalanced: { label: 'Unbalanced', tone: 'text-destructive bg-destructive/10 border-destructive/30' },
};

const RATING_DOT = { good: 'bg-success', fair: 'bg-amber-500', poor: 'bg-destructive' };

/** Same fingerprint as the server's, to tell when the menu changed since the check. */
function menuKeyOf(fp) {
  const courses = (fp.menuCourses || [])
    .map((c) => `${String(c.name || '').trim()}:${(c.dishes || []).map((d) => String(d).trim()).filter(Boolean).join('|')}`)
    .join('||');
  return `${courses}##${String(fp.menu || '').trim()}`;
}

/**
 * AI check of the sheet's menu: variety of flavours, colours, cooking
 * methods and main ingredients, with concrete swaps for any clash. Runs on
 * the saved menu; the result stays on the sheet until the next check.
 */
export default function MenuCheckCard({ fp, dirty, readOnly, onChecked }) {
  const [busy, setBusy] = useState(false);
  const check = fp.menuCheck?.result ? fp.menuCheck : null;
  const stale = check && check.menuKey !== menuKeyOf(fp);
  const verdict = check ? VERDICTS[check.result.verdict] : null;

  async function run() {
    setBusy(true);
    try {
      const res = await api.post(`/prospectus/${fp._id}/menu-check`);
      onChecked?.(res?.data?.data?.menuCheck);
      toast.success('Menu checked');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not check the menu'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Menu check
          </CardTitle>
          {!readOnly ? (
            <Button size="sm" variant="outline" onClick={run} disabled={busy || dirty}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {check ? 'Check again' : 'Check menu'}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {dirty ? <p className="text-xs text-muted-foreground">Save the sheet first — the check reads the saved menu.</p> : null}
        {!check ? (
          <p className="text-muted-foreground">
            Checks the dishes for variety in flavour, colour, cooking method and main ingredient, and suggests swaps where the menu
            repeats itself.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', verdict?.tone)}>{verdict?.label}</span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(check.at)}
                {check.byName ? ` · ${check.byName}` : ''}
              </span>
            </div>
            {stale ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                The menu changed since this check — run it again.
              </p>
            ) : null}
            <p className="text-foreground">{check.result.summary}</p>
            <ul className="space-y-1.5">
              {check.result.aspects.map((a) => (
                <li key={a.aspect} className="flex items-start gap-2">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', RATING_DOT[a.rating])} aria-label={a.rating} />
                  <span>
                    <span className="font-medium text-foreground">{a.aspect}</span>
                    <span className="text-muted-foreground"> — {a.finding}</span>
                  </span>
                </li>
              ))}
            </ul>
            {check.result.issues.length ? (
              <div className="space-y-2 border-t pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To look at</p>
                {check.result.issues.map((issue, i) => (
                  <div key={i} className="rounded-md border p-2">
                    <p className="text-foreground">
                      <span className="font-medium">{issue.course}</span>
                      {issue.dishes.length ? <span className="text-muted-foreground"> · {issue.dishes.join(', ')}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{issue.problem}</p>
                    <p className="mt-1 text-xs text-foreground">Try: {issue.suggestion}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {check.result.dishes.length ? (
              <details className="border-t pt-2">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  How each dish was read ({check.result.dishes.length})
                </summary>
                <div className="mt-2 max-h-64 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-2 font-medium">Dish</th>
                        <th className="py-1 pr-2 font-medium">Flavour</th>
                        <th className="py-1 pr-2 font-medium">Colour</th>
                        <th className="py-1 pr-2 font-medium">Method</th>
                        <th className="py-1 font-medium">Main ingredient</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {check.result.dishes.map((d, i) => (
                        <tr key={i}>
                          <td className="py-1 pr-2 text-foreground">{d.dish}</td>
                          <td className="py-1 pr-2">{d.flavour}</td>
                          <td className="py-1 pr-2">{d.colour}</td>
                          <td className="py-1 pr-2">{d.method}</td>
                          <td className="py-1">{d.ingredient}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
