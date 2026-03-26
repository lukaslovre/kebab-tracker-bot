import { type KebabDashboardData } from "../db/db";
import { renderKebabDashboardReply } from "../templates/hr";
import { getKebabLevel } from "./levels";
import { formatUtcInTimeZone, HR_TIME_ZONE } from "./time";

/**
 * Build the unified “Dashboard” reply from the data we can query from SQLite.
 *
 * Keeping this in a standalone helper lets both:
 * - the comment handler (ingestion)
 * - the reply worker (retrying pending replies)
 * reuse the exact same rendering logic.
 */
export function buildKebabDashboardReplyFromLogData(
  dash: KebabDashboardData,
): string {
  const eaten = new Date(dash.eatenAtIso);
  const logged = new Date(dash.loggedAtIso);

  const isBackdated = eaten.getTime() < logged.getTime() - 60_000;

  const prevGlobal = dash.prevGlobalEatenAtIso
    ? new Date(dash.prevGlobalEatenAtIso)
    : null;
  const prevUser = dash.prevUserEatenAtIso
    ? new Date(dash.prevUserEatenAtIso)
    : null;

  const globalDeltaMs =
    prevGlobal === null
      ? null
      : Math.max(0, eaten.getTime() - prevGlobal.getTime());
  const personalDeltaMs =
    prevUser === null
      ? null
      : Math.max(0, eaten.getTime() - prevUser.getTime());

  return renderKebabDashboardReply({
    rating: dash.rating,
    isBackdated,
    eatenAtLocal: formatUtcInTimeZone(eaten, HR_TIME_ZONE),
    globalDeltaMs,
    personalDeltaMs,
    totalKebabs: dash.userTotalKebabs,
    level: getKebabLevel(dash.userTotalKebabs),
    avgRating: dash.userAvgRating,
  });
}
