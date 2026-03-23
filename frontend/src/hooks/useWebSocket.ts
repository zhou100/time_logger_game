/**
 * WebSocket hook — connects to /api/v1/ws and dispatches server events
 * into the React Query cache so components update automatically.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AuthService from '../services/auth';
import { API_BASE_URL } from '../services/api';
import { WsEvent } from '../types/api';
import { ENTRIES_KEY } from './useEntries';
import { STATS_KEY } from './useStats';
import Logger from '../utils/logger';

const WS_BASE = API_BASE_URL.replace(/^http/, 'ws');

export function useWebSocket() {
    const queryClient = useQueryClient();
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function connect() {
            if (cancelled) return;
            try {
                const token = await AuthService.getValidToken();
                const url = `${WS_BASE}/api/v1/ws?token=${encodeURIComponent(token)}`;
                const ws = new WebSocket(url);
                wsRef.current = ws;

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data) as WsEvent;
                        handleEvent(msg, queryClient);
                    } catch (err) {
                        Logger.warn('Unparseable WS message:', event.data);
                    }
                };

                ws.onclose = (ev) => {
                    if (!cancelled && ev.code !== 4001) {
                        // Reconnect with backoff
                        reconnectTimer.current = setTimeout(connect, 3000);
                    }
                };

                ws.onerror = () => {
                    Logger.debug('WebSocket error, will reconnect');
                };
            } catch {
                if (!cancelled) {
                    reconnectTimer.current = setTimeout(connect, 5000);
                }
            }
        }

        if (AuthService.isAuthenticated()) {
            connect();
        }

        return () => {
            cancelled = true;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            wsRef.current?.close();
        };
    }, [queryClient]);
}

function handleEvent(event: WsEvent, queryClient: ReturnType<typeof useQueryClient>) {
    Logger.debug('WS event:', event.type);

    switch (event.type) {
        case 'entry.classified':
        case 'entry.failed':
            // Refresh the status query for this specific entry
            queryClient.invalidateQueries({ queryKey: ['entry-status', event.entry_id] });
            // Refresh the entries list so the new category shows up
            queryClient.invalidateQueries({ queryKey: ENTRIES_KEY });
            break;

        case 'stats.updated':
            // Patch stats cache directly to avoid a round-trip
            queryClient.setQueryData(STATS_KEY, (prev: any) => ({
                ...prev,
                total_entries: event.total_entries,
                current_streak: event.current_streak,
                level: event.level,
                xp: event.xp,
            }));
            break;

        case 'streak.extended':
        case 'level_up':
            queryClient.invalidateQueries({ queryKey: STATS_KEY });
            break;
    }
}
