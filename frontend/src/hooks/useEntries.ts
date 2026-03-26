import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entriesApi } from '../services/api';
import { EntryListResponse, EntryItem, CategoryItem } from '../types/api';

export const ENTRIES_KEY = ['entries'] as const;

export function useEntries(skip = 0, limit = 20, date?: string) {
    return useQuery<EntryListResponse>({
        queryKey: [...ENTRIES_KEY, skip, limit, date],
        queryFn: () => entriesApi.list(skip, limit, date),
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
        mutationFn: ({ entryId, data }: { entryId: string; data: { transcript?: string; categories?: CategoryItem[] } }) =>
            entriesApi.updateEntry(entryId, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ENTRIES_KEY }); },
    });
}
