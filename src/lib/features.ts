export function getFeatures(isLoggedIn: boolean) {
  return {
    // When true, only recipes with status === 'published' are shown.
    filterByStatus: !isLoggedIn,
    // When true, the status filter UI is shown on the recipe grid.
    showStatusFilter: isLoggedIn,
  };
}
