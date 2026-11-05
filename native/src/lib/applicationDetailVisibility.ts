/**
 * Candidate application detail is a private, route-scoped Native screen. The
 * route instance must not inherit an earlier application, Clerk user/session,
 * or App Lock draft; the server remains the authority for application access.
 */
const APPLICATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function candidateApplicationDetailKey(
  ownerKey: string | null,
  routeId: string | string[] | undefined,
  privateDataAllowed: boolean,
): string | null {
  if (!privateDataAllowed || !ownerKey) return null;
  const applicationId = Array.isArray(routeId) ? routeId[0] : routeId;
  if (typeof applicationId !== 'string' || !APPLICATION_UUID.test(applicationId)) return null;
  return JSON.stringify([ownerKey, applicationId.toLowerCase()]);
}
