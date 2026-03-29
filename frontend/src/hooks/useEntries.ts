import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entriesApi } from '../services/api';
import { EntryListResponse, EntryItem, CategoryItem } from '../types/api';

export const ENTRIES_KEY = ['entries'] as const;

export function useEntries(skip = 0, limit = 20, date?: string) {
    return useQuery<EntryListResponse>({
        queryKey: [...ENTRIES_KEY, skip, limit, date],
        queryFn: () => entriesApi.list(skip, limit, date),
        placeholderData: (prev, prevQuery) => {
            // Only reuse placeholder if the date hasn't changed, to avoid
            // flashing stale entries under a new date label.
            const prevDate = prevQuery?.queryKey[3];
            return prevDate === date ? prev : undefined;
        },
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

export function useDeleteEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (entryId: string) => entriesApi.deleteEntry(entryId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ENTRIES_KEY }); },
    });
}

export function useUpdateEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ entryId, data }: { entryId: string; data: { transcript?: string; categories?: CategoryItem[]; date?: string } }) =>
            entriesApi.updateEntry(entryId, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ENTRIES_KEY }); },
    });
}

export function useMoveEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ entryId, date }: { entryId: string; date: string }) =>
            entriesApi.updateEntry(entryId, { date }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ENTRIES_KEY });
            qc.invalidateQueries({ queryKey: ['active-dates'] });
        },
    });
}
