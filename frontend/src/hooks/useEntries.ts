import { useQuery, useQueryClient } from '@tanstack/react-query';
import { entriesApi } from '../services/api';
import { EntryListResponse } from '../types/api';

export const ENTRIES_KEY = ['entries'] as const;

export function useEntries(skip = 0, limit = 20) {
    return useQuery<EntryListResponse>({
        queryKey: [...ENTRIES_KEY, skip, limit],
        queryFn: () => entriesApi.list(skip, limit),
        placeholderData: (prev) => prev,
    });
}

export function useEntryStatus(entryId: string | null, enabled = true) {
    return useQuery({
        queryKey: ['entry-status', entryId],
        queryFn: () => entriesApi.getStatus(entryId!),
        enabled: !!entryId && enabled,
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            // Stop polling once terminal state reached
            if (status === 'done' || status === 'failed') return false;
            return 2000; // poll every 2 s while processing
        },
    });
}
