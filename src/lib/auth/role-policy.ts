/** Access derives only from the persisted profile role, including after a lookup failure. */
export function roleAccess(role: unknown) {
  return {isAdmin:role==='admin',isEditor:role==='admin'||role==='editor',isViewer:role==='viewer'};
}
