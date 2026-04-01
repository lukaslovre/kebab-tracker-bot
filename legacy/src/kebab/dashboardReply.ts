import { type KebabDashboardData } from "../db/db";
import { renderKebabDashboardReply } from "../templates/hr";
import { getKebabLevel } from "./levels";
import { formatUtcInTimeZone } from "./time";

/**
 * Build the unified “Dashboard” reply from the data we can query from SQLite.
 *
 * Keeping this in a standalone helper lets the reply worker reuse the exact
 * same rendering logic whenever it needs to format a dashboard reply.
 */
export function buildKebabDashboardReplyFromLogData(
  dash: KebabDashboardData,
  options: {
    timeZone: string;
    itemsPerLevel: number;
    trackerCommand: string;
  },
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

  const level = getKebabLevel(dash.userTotalKebabs, options.itemsPerLevel);

  return renderKebabDashboardReply(
    {
      rating: dash.rating,
      isBackdated,
      eatenAtLocal: formatUtcInTimeZone(eaten, options.timeZone),
      globalDeltaMs,
      personalDeltaMs,
      totalKebabs: dash.userTotalKebabs,
      level,
      avgRating: dash.userAvgRating,
    },
    { trackerCommand: options.trackerCommand },
  );
}
