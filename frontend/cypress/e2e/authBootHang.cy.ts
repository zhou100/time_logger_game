/**
 * Regression: logged-in users used to see an infinite spinner on `/`
 * because AuthContext awaited supabase.auth.getSession() before unblocking
 * the UI, and that call could hang indefinitely (supabase-js _acquireLock
 * deadlock or slow token refresh on Render free-tier cold start).
 *
 * The fix: synchronously restore the user from localStorage and flip
 * isLoading=false immediately. getSession() runs in the background.
 *
 * This test seeds a Supabase-shaped session token, stalls every network
 * request, and asserts the recorder UI is visible within 2s — proving the
 * boot path no longer blocks on the network.
 */
describe('Auth boot does not hang on slow network', () => {
    beforeEach(() => {
        // Stall every outbound request indefinitely. If the boot path awaits
        // ANY of them before rendering, this test will time out.
        cy.intercept('**/*', (req) => {
            return new Promise(() => {
                /* never resolve */
            });
        });

        // Seed a Supabase-shaped session in localStorage. AuthContext's
        // synchronous initializer scans for keys matching `sb-*-auth-token`.
        const fakeSession = {
            access_token: 'fake.jwt.token',
            refresh_token: 'fake-refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer',
            user: {
                id: 'fake-user-id',
                email: 'test@example.com',
            },
        };
        cy.window().then((win) => {
            win.localStorage.setItem('sb-fakeproject-auth-token', JSON.stringify(fakeSession));
        });
    });

    it('renders the recorder within 2s even when every request hangs', () => {
        cy.visit('/');

        // The recorder UI mounts only when AuthContext reports the user
        // as authenticated AND not loading. If isLoading is stuck true
        // (the regression), this assertion times out.
        // The "Time Logger" h1 lives inside RecordingPage, which only mounts
        // when isAuthenticated && !isLoading. If isLoading is stuck true,
        // HomePage shows a CircularProgress instead and this assertion fails.
        cy.contains('h1', 'Time Logger', { timeout: 2000 }).should('be.visible');
    });
});
