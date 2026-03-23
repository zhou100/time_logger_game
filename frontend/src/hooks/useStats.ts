import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../services/api';
import { UserStats } from '../types/api';

export const STATS_KEY = ['me', 'stats'] as const;

export function useStats() {
    return useQuery<UserStats>({
        queryKey: STATS_KEY,
        queryFn: statsApi.get,
        staleTime: 10_000,
    });
}
