import LoginClient from "./login-client";

/**
 * The form is a client component but takes no request-time input, so it
 * pre-renders with the markup already in place — the page paints complete
 * rather than blank-then-hydrated.
 */
export default function LoginPage() {
  return <LoginClient />;
}
