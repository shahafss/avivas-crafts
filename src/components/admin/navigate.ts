/** Full page load of a path on this site (after sign-in steps, so the server renders with the new cookie). */
export function goTo(path: string): void {
  window.location.assign(new URL(path, window.location.origin));
}

export function goToDashboard(): void {
  goTo('/admin');
}

export function goToSignIn(): void {
  goTo('/admin/sign-in');
}

export function goToSignInExpired(): void {
  goTo('/admin/sign-in?e=expired');
}
