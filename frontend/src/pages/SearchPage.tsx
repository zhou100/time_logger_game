import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import SearchIcon from '@mui/icons-material/Search';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Container,
    FormControl,
    InputAdornment,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import EntryCard from '../components/EntryCard';
import { entriesApi } from '../services/api';
import { ENTRIES_KEY } from '../hooks/useEntries';
import { Category } from '../types/api';
import { palette } from '../theme';

const SEARCH_PAGE_SIZE = 20;
const SEARCHABLE_CATEGORIES = [
    Category.EARNING,
    Category.LEARNING,
    Category.RELAXING,
    Category.FAMILY,
    Category.TODO,
    Category.EXPERIMENT,
    Category.REFLECTION,
    Category.TIME_RECORD,
] as const;

function normalizeSearchText(value: string): string {
    return value.trim().toLowerCase();
}

function toLocalDateString(value: string): string {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const SearchPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const currentQuery = searchParams.get('q') ?? '';
    const currentCategory = searchParams.get('category') ?? '';
    const currentDateFrom = searchParams.get('date_from') ?? '';
    const currentDateTo = searchParams.get('date_to') ?? '';
    const normalizedQuery = normalizeSearchText(currentQuery);

    const [draftQuery, setDraftQuery] = useState(currentQuery);
    const [draftCategory, setDraftCategory] = useState(currentCategory);
    const [draftDateFrom, setDraftDateFrom] = useState(currentDateFrom);
    const [draftDateTo, setDraftDateTo] = useState(currentDateTo);

    useEffect(() => {
        setDraftQuery(currentQuery);
        setDraftCategory(currentCategory);
        setDraftDateFrom(currentDateFrom);
        setDraftDateTo(currentDateTo);
    }, [currentCategory, currentDateFrom, currentDateTo, currentQuery]);

    const queryTooShort = normalizedQuery.length > 0 && normalizedQuery.length < 2;
    const hasInvalidDateRange = !!currentDateFrom && !!currentDateTo && currentDateFrom > currentDateTo;

    const {
        data,
        isLoading,
        isError,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: [...ENTRIES_KEY, 'search', normalizedQuery, currentCategory, currentDateFrom, currentDateTo],
        queryFn: ({ pageParam }) => entriesApi.search(currentQuery.trim(), {
            skip: pageParam,
            limit: SEARCH_PAGE_SIZE,
            category: currentCategory || undefined,
            dateFrom: currentDateFrom || undefined,
            dateTo: currentDateTo || undefined,
        }),
        initialPageParam: 0,
        enabled: normalizedQuery.length >= 2 && !hasInvalidDateRange,
        getNextPageParam: (lastPage, allPages) => {
            const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
            return loaded < lastPage.total ? loaded : undefined;
        },
        staleTime: 60_000,
    });

    const results = useMemo(
        () => data?.pages.flatMap((page) => page.items) ?? [],
        [data]
    );
    const totalMatches = data?.pages[0]?.total ?? 0;

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const params = new URLSearchParams();
        const nextQuery = draftQuery.trim();
        if (nextQuery) params.set('q', nextQuery);
        if (draftCategory) params.set('category', draftCategory);
        if (draftDateFrom) params.set('date_from', draftDateFrom);
        if (draftDateTo) params.set('date_to', draftDateTo);
        navigate(params.toString() ? `/search?${params.toString()}` : '/search');
    };

    return (
        <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
            <Stack spacing={3}>
                <Box>
                    <Typography variant="overline" color="text.secondary">
                        Search Records
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 0.5, mb: 1 }}>
                        Find past entries fast
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Search across transcripts and classified lines from your previous records.
                    </Typography>
                </Box>

                <Box
                    component="form"
                    onSubmit={handleSubmit}
                    sx={{
                        p: 2,
                        border: `1px solid ${palette.rule}`,
                        borderRadius: '12px',
                        bgcolor: 'background.paper',
                    }}
                >
                    <Stack spacing={1.5}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                            <TextField
                                fullWidth
                                value={draftQuery}
                                onChange={(event) => setDraftQuery(event.target.value)}
                                placeholder="Search transcripts, TODOs, reflections..."
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon fontSize="small" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            <Button type="submit" variant="contained" sx={{ minWidth: { sm: 120 } }}>
                                Search
                            </Button>
                        </Stack>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                            <FormControl size="small" sx={{ minWidth: { sm: 180 } }}>
                                <InputLabel id="search-category-label">Category</InputLabel>
                                <Select
                                    labelId="search-category-label"
                                    label="Category"
                                    value={draftCategory}
                                    onChange={(event) => setDraftCategory(event.target.value)}
                                >
                                    <MenuItem value="">All categories</MenuItem>
                                    {SEARCHABLE_CATEGORIES.map((category) => (
                                        <MenuItem key={category} value={category}>{category}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField
                                size="small"
                                label="From"
                                type="date"
                                value={draftDateFrom}
                                onChange={(event) => setDraftDateFrom(event.target.value)}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                            <TextField
                                size="small"
                                label="To"
                                type="date"
                                value={draftDateTo}
                                onChange={(event) => setDraftDateTo(event.target.value)}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                        </Stack>
                    </Stack>
                </Box>

                {!normalizedQuery && (
                    <Alert severity="info">
                        Enter a phrase above to search your past records.
                    </Alert>
                )}

                {queryTooShort && (
                    <Alert severity="info">
                        Type at least 2 characters to search.
                    </Alert>
                )}

                {hasInvalidDateRange && (
                    <Alert severity="warning">
                        The start date needs to be on or before the end date.
                    </Alert>
                )}

                {isLoading && (
                    <Box sx={{ minHeight: '20vh', display: 'grid', placeItems: 'center' }}>
                        <CircularProgress size={28} />
                    </Box>
                )}

                {isError && (
                    <Alert severity="error">
                        {(error as Error)?.message || 'Could not load your records for search.'}
                    </Alert>
                )}

                {!isLoading && !isError && normalizedQuery.length >= 2 && !hasInvalidDateRange && (
                    <Stack spacing={2}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                            <Typography variant="body2" color="text.secondary">
                                {totalMatches} result{totalMatches === 1 ? '' : 's'} for "{currentQuery}"
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Showing {results.length} of {totalMatches}
                            </Typography>
                        </Box>

                        {results.length === 0 ? (
                            <Alert severity="warning">
                                No matching records yet. Try a shorter keyword, a broader date range, or a different category.
                            </Alert>
                        ) : (
                            <Stack spacing={2}>
                                <Box
                                    sx={{
                                        p: { xs: 2, md: 3 },
                                        border: `1px solid ${palette.rule}`,
                                        borderRadius: '16px',
                                        bgcolor: 'background.paper',
                                    }}
                                >
                                    {results.map((entry) => (
                                        <EntryCard
                                            key={entry.id}
                                            entry={entry}
                                            readOnly
                                            highlightTerm={currentQuery}
                                            footerExtra={(
                                                <Button
                                                    component={RouterLink}
                                                    to={`/?date=${encodeURIComponent(toLocalDateString(entry.recorded_at || entry.created_at))}`}
                                                    size="small"
                                                    sx={{ minWidth: 'auto', px: 0 }}
                                                >
                                                    Open day
                                                </Button>
                                            )}
                                        />
                                    ))}
                                </Box>

                                {hasNextPage && (
                                    <Button
                                        variant="outlined"
                                        onClick={() => fetchNextPage()}
                                        disabled={isFetchingNextPage}
                                    >
                                        {isFetchingNextPage ? 'Loading more...' : 'Load more'}
                                    </Button>
                                )}
                            </Stack>
                        )}
                    </Stack>
                )}
            </Stack>
        </Container>
    );
};

export default SearchPage;
