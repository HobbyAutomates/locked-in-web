/**
 * v2.16 "FOUNDER" plate on Profile. The existing "Founding member" criterion (v2.12, both apps):
 * every current account is in the launch cohort. Kept as one function so a cut-off date can be
 * added later in one place (Android: same rule in ProfileScreen.kt).
 */
export function isFoundingMember(joinedAt: string | null | undefined): boolean {
  void joinedAt;
  return true;
}
