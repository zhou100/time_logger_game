/**
 * Supabase Realtime hook — subscribes to the `notifications` table
 * for the current user and invalidates React Query cache on new events.
 *
 * Falls back to polling (useEntryStatus) when Supabase is not configured.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase, isSupabaseConfigured } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ENTRIES_KEY } from './useEntries';
import Logger from '../utils/logger';

export function useRealtimeNotifications() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    useEffect(() => {
        if (!isSupabaseConfigured || !user) return;

        const supabase = getSupabase();
        if (!supabase) return;

        const channel = supabase
            .channel('notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const row = payload.new as { event_type: string; payload_json: string };
                    Logger.debug('Realtime notification:', row.event_type);

                    try {
                        const data = JSON.parse(row.payload_json);

                        switch (row.event_type) {
                            case 'entry.classified':
                            case 'entry.failed':
                                queryClient.invalidateQueries({ queryKey: ['entry-status', data.entry_id] });
                                queryClient.invalidateQueries({ queryKey: ENTRIES_KEY });
                                break;
                        }
                    } catch (err) {
                        Logger.warn('Failed to parse notification payload:', err);
                    }
                }
            )
            .subscribe((status) => {
                Logger.debug('Realtime channel status:', status);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient, user]);
}
