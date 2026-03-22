const isDev = process.env.NODE_ENV === "development";

export const features = {
  // When true, recipe results are filtered to the raymonds.recipes source only.
  filterByOwnSource: !isDev,
  // When true, only recipes with metadata.status === 'published' are shown.
  filterByStatus: !isDev,
  // When true, the source filter UI is shown on the recipe grid.
  showSourceFilter: isDev,
} satisfies Record<string, boolean>;
