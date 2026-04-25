import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { palette } from '../../theme';
import { demoApi, writePermit } from '../../services/demoApi';
import Logger from '../../utils/logger';

/**
 * Cloudflare Turnstile widget — rendered ONCE per hour after first mic tap.
 *
 * Loading rules:
 *   - The Turnstile script tag is injected exactly once per page load
 *     (idempotent: re-render does NOT add another <script>).
 *   - The widget itself renders on every mount of this component, but the
 *     parent page only mounts us when needed (no permit / expired permit).
 *   - On unmount we call `turnstile.remove(widgetId)` so we don't leak DOM
 *     references on route changes.
 *
 * Flow:
 *   - User solves the challenge → Cloudflare gives us a `token`.
 *   - We POST `/v1/public/demo/verify-turnstile { token }`. Backend verifies
 *     with Cloudflare and returns `{ permit_token, expires_at }`.
 *   - We stash that in sessionStorage and call `onPermit(permit_token)`.
 *   - On verify failure, the widget re-challenges inline.
 *
 * Site key: `process.env.REACT_APP_TURNSTILE_SITE_KEY`. If missing in dev,
 * we surface a soft warning rather than rendering nothing — easier to debug.
 */

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// turnstile global is injected by the script tag
type TurnstileGlobal = {
    render: (
        container: HTMLElement | string,
        options: {
            sitekey: string;
            callback: (token: string) => void;
            'error-callback'?: (err?: string) => void;
            'expired-callback'?: () => void;
            theme?: 'light' | 'dark' | 'auto';
            appearance?: 'always' | 'execute' | 'interaction-only';
        },
    ) => string;
    reset: (id?: string) => void;
    remove: (id: string) => void;
};

declare global {
    interface Window {
        turnstile?: TurnstileGlobal;
    }
}

let scriptLoading: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.turnstile) return Promise.resolve();
    if (scriptLoading) return scriptLoading;

    scriptLoading = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
            `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
        );
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Turnstile script failed')));
            // If it already loaded but the global isn't there yet, give it a tick
            if (window.turnstile) resolve();
            return;
        }
        const s = document.createElement('script');
        s.src = TURNSTILE_SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Turnstile script failed to load'));
        document.head.appendChild(s);
    });

    return scriptLoading;
}

interface Props {
    /** Called with the verified permit token after successful Cloudflare + backend verify. */
    onPermit: (permitToken: string) => void;
    /** Called when verification fails after Cloudflare succeeded — usually a backend issue. */
    onError?: (err: Error) => void;
}

const TurnstileWidget: React.FC<Props> = ({ onPermit, onError }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);

    const siteKey = process.env.REACT_APP_TURNSTILE_SITE_KEY || '';

    useEffect(() => {
        let cancelled = false;
        if (!siteKey) {
            Logger.warn('Turnstile: REACT_APP_TURNSTILE_SITE_KEY is not set');
            return;
        }

        loadTurnstileScript()
            .then(() => {
                if (cancelled) return;
                if (!window.turnstile || !containerRef.current) return;
                widgetIdRef.current = window.turnstile.render(containerRef.current, {
                    sitekey: siteKey,
                    appearance: 'always',
                    theme: 'light',
                    callback: async (token: string) => {
                        setVerifying(true);
                        setVerifyError(null);
                        try {
                            const res = await demoApi.verifyTurnstile(token);
                            writePermit(res.permit_token, res.expires_at);
                            onPermit(res.permit_token);
                        } catch (err) {
                            const msg =
                                err instanceof Error
                                    ? err.message
                                    : 'Verification failed. Try again.';
                            setVerifyError(msg);
                            onError?.(err as Error);
                            // Re-challenge inline on backend failure.
                            try {
                                window.turnstile?.reset(widgetIdRef.current ?? undefined);
                            } catch {
                                // no-op
                            }
                        } finally {
                            setVerifying(false);
                        }
                    },
                    'error-callback': (err?: string) => {
                        Logger.warn('Turnstile error-callback', err);
                    },
                    'expired-callback': () => {
                        try {
                            window.turnstile?.reset(widgetIdRef.current ?? undefined);
                        } catch {
                            // no-op
                        }
                    },
                });
            })
            .catch((err) => {
                Logger.error('Turnstile script load failed', err);
                onError?.(err as Error);
            });

        return () => {
            cancelled = true;
            const id = widgetIdRef.current;
            if (id && window.turnstile) {
                try {
                    window.turnstile.remove(id);
                } catch {
                    // turnstile.remove can throw if already gone — ignore
                }
            }
        };
    // The widget has no "props" to react to during its lifetime; mount once
    // per siteKey. Callbacks are intentionally captured at mount time.
    // eslint-disable-next-line
    }, [siteKey]);

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
            }}
            data-testid="turnstile-widget"
        >
            <Box
                ref={containerRef}
                sx={{
                    minHeight: 65,
                    minWidth: 300,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            />
            <Typography
                variant="caption"
                sx={{ color: palette.textMuted, textAlign: 'center', maxWidth: 320 }}
            >
                Quick verification so bots don’t run up our OpenAI bill.
                <br />
                You’ll never see this signed in.
            </Typography>
            {verifying && (
                <Typography variant="caption" sx={{ color: palette.textMuted }}>
                    Verifying…
                </Typography>
            )}
            {verifyError && (
                <Typography variant="caption" sx={{ color: palette.error }}>
                    {verifyError}
                </Typography>
            )}
        </Box>
    );
};

export default TurnstileWidget;
