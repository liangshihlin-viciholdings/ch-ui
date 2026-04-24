// src/features/analytics/utils/queryInterpolation.ts
// Query variable interpolation for rawsql chart configs.
// Ported from metrics/utils/queryInterpolation.ts with analytics TimeRange format.

interface QueryVariable {
  name: string;
  value: string | number;
}

const formatClickHouseDate = (date: Date): string => {
  return date.toISOString().slice(0, 19).replace("T", " ");
};

const formatTimeFromTo = (start: Date, end: Date): string => {
  return `'${formatClickHouseDate(start)}' AND '${formatClickHouseDate(end)}'`;
};

const calculateAutoInterval = (start: Date, end: Date): string => {
  const diffMs = end.getTime() - start.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  if (diffMinutes <= 30) return "INTERVAL 1 MINUTE";
  if (diffMinutes <= 180) return "INTERVAL 5 MINUTE";
  if (diffMinutes <= 720) return "INTERVAL 15 MINUTE";
  if (diffMinutes <= 1440) return "INTERVAL 1 HOUR";
  if (diffMinutes <= 10080) return "INTERVAL 6 HOUR";
  if (diffMinutes <= 43200) return "INTERVAL 1 DAY";
  return "INTERVAL 1 WEEK";
};

const getTimeGroupingFunction = (start: Date, end: Date): string => {
  const diffMs = end.getTime() - start.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  if (diffMinutes <= 30) return "toStartOfMinute";
  if (diffMinutes <= 180) return "toStartOfFiveMinutes";
  if (diffMinutes <= 720) return "toStartOfFifteenMinutes";
  if (diffMinutes <= 1440) return "toStartOfHour";
  if (diffMinutes <= 10080) return "toStartOfSixHours";
  if (diffMinutes <= 43200) return "toStartOfDay";
  return "toStartOfWeek";
};

const getBucketStepSeconds = (
  start: Date,
  end: Date,
  targetBuckets = 120
): number => {
  const diffSec = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / 1000)
  );
  const raw = Math.max(1, Math.floor(diffSec / Math.max(1, targetBuckets)));
  const steps = [
    1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600,
    43200, 86400, 604800,
  ];
  let step = steps[0];
  for (const s of steps) {
    step = s;
    if (s >= raw) break;
  }
  return step;
};

const getAdaptiveTimeGroupExpr = (start: Date, end: Date): string => {
  const step = getBucketStepSeconds(start, end);
  return `toStartOfInterval(event_time, INTERVAL ${step} SECOND)`;
};

const getBuiltInVariables = (dateRange: [Date, Date]): QueryVariable[] => {
  const [start, end] = dateRange;
  const bucketSec = getBucketStepSeconds(start, end);

  return [
    { name: "$__timeFromTo", value: formatTimeFromTo(start, end) },
    { name: "$__timeFrom", value: `'${formatClickHouseDate(start)}'` },
    { name: "$__timeTo", value: `'${formatClickHouseDate(end)}'` },
    {
      name: "$__timeFilter",
      value: `event_time BETWEEN ${formatTimeFromTo(start, end)}`,
    },
    { name: "$__interval", value: calculateAutoInterval(start, end) },
    {
      name: "$__timeGroupExpr",
      value: `${getTimeGroupingFunction(start, end)}(event_time)`,
    },
    { name: "$__timeGroup", value: getTimeGroupingFunction(start, end) },
    {
      name: "$__seconds",
      value: Math.max(1, Math.floor((end.getTime() - start.getTime()) / 1000)),
    },
    { name: "$__bucketSec", value: bucketSec },
    { name: "$__timeBucket", value: getAdaptiveTimeGroupExpr(start, end) },
    { name: "$__unixEpochFrom", value: Math.floor(start.getTime() / 1000) },
    { name: "$__unixEpochTo", value: Math.floor(end.getTime() / 1000) },
  ];
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function interpolateQuery(
  query: string,
  dateRange: [Date, Date],
  customVariables: QueryVariable[] = []
): string {
  let result = query;
  const allVars = [...getBuiltInVariables(dateRange), ...customVariables];

  for (const v of allVars) {
    const regex = new RegExp(escapeRegExp(v.name), "g");
    result = result.replace(regex, String(v.value));
  }

  return result;
}

export function hasTemplateVariables(query: string): boolean {
  return /\$__\w+/.test(query);
}
