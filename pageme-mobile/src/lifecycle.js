export function shouldSyncPagerMode(active, previouslyActive) {
  return active === true || previouslyActive === true;
}
