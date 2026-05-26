// Global store for test identity to bypass auth during integration tests
let forcedIdentity: any = null;

export function forceIdentity(identity: any) {
  forcedIdentity = identity;
}

export function getForcedIdentity() {
  return forcedIdentity;
}

export function clearForcedIdentity() {
  forcedIdentity = null;
}
