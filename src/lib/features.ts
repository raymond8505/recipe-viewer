export function getFeatures(isLoggedIn: boolean) {
  return {
    // When true, recipe results are filtered to the raymonds.recipes source only.
    filterByOwnSource: !isLoggedIn,
    // When true, only recipes with status === 'published' are shown.
    filterByStatus: !isLoggedIn,
    // When true, the source filter UI is shown on the recipe grid.
    showSourceFilter: isLoggedIn,
  };
}
