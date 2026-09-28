/**
 * The URL parameters that mean a reader opened on the records view rather
 * than the overview. The renderer inlines the list into a head script so the
 * right view shows before the runtime loads, and the runtime reads it to keep
 * URLs short: `view` is only written when it differs from what the parameters
 * already imply.
 */
export const recordsViewParams: readonly string[] = [
  "q",
  "kind",
  "status",
  "area",
  "release",
  "tag",
  "warning",
  "missingRef",
  "duplicate",
  "coverage",
  "record",
  "file",
  "symbol",
  "linked",
  "changed",
  "month",
  "week",
  "page",
  "sort",
];
