import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SearchPage from './SearchPage';
import { entriesApi } from '../services/api';

jest.mock('../services/api', () => ({
  entriesApi: {
    search: jest.fn(),
    getActiveDates: jest.fn(),
  },
}));

function renderSearchPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SearchPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (entriesApi.getActiveDates as jest.Mock).mockResolvedValue([]);
  });

  it('requires at least two characters before searching', () => {
    renderSearchPage('/search?q=a');

    expect(screen.getByText(/type at least 2 characters/i)).toBeInTheDocument();
    expect(entriesApi.search).not.toHaveBeenCalled();
  });

  it('submits filters to the backend and renders highlighted results', async () => {
    (entriesApi.search as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'entry-1',
          transcript: 'I had a long day, then remembered to buy milk after work and send the design update before heading home.',
          recorded_at: '2026-04-10T09:30:00Z',
          created_at: '2026-04-10T09:30:00Z',
          local_date: '2026-04-10',
          match_sources: ['transcript', 'category_line'],
          duration_seconds: 30,
          categories: [{ id: 'cat-1', text: 'buy milk after work', category: 'TODO' }],
        },
      ],
      total: 1,
      skip: 0,
      limit: 20,
    });

    const { container } = renderSearchPage('/search?q=milk&category=TODO&date_from=2026-04-01&date_to=2026-04-10');

    await waitFor(() => {
      expect(entriesApi.search).toHaveBeenCalledWith('milk', {
        skip: 0,
        limit: 20,
        category: 'TODO',
        dateFrom: '2026-04-01',
        dateTo: '2026-04-10',
      });
    });

    expect(await screen.findByText(/showing 1 of 1/i)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /open day/i })).toHaveAttribute('href', '/?date=2026-04-10');
    expect(container.querySelector('mark')).toBeTruthy();
    expect(await screen.findByText(/matched transcript/i)).toBeInTheDocument();
    expect(await screen.findByText(/matched classified line/i)).toBeInTheDocument();
    expect(await screen.findByText(/i had a long day, then remembered to/i)).toBeInTheDocument();
  });

  it('loads more results when requested', async () => {
    (entriesApi.search as jest.Mock)
      .mockResolvedValueOnce({
        items: Array.from({ length: 20 }, (_, index) => ({
          id: `entry-${index}`,
          transcript: `milk note ${index}`,
          recorded_at: '2026-04-10T09:30:00Z',
          created_at: '2026-04-10T09:30:00Z',
          local_date: '2026-04-10',
          match_sources: ['transcript'],
          duration_seconds: 30,
          categories: [{ id: `cat-${index}`, text: `milk note ${index}`, category: 'TODO' }],
        })),
        total: 21,
        skip: 0,
        limit: 20,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'entry-20',
            transcript: 'milk note 20',
            recorded_at: '2026-04-10T09:30:00Z',
            created_at: '2026-04-10T09:30:00Z',
            local_date: '2026-04-10',
            match_sources: ['transcript'],
            duration_seconds: 30,
            categories: [{ id: 'cat-20', text: 'milk note 20', category: 'TODO' }],
          },
        ],
        total: 21,
        skip: 20,
        limit: 20,
      });

    renderSearchPage('/search?q=milk');

    const loadMore = await screen.findByRole('button', { name: /load more/i });
    await userEvent.click(loadMore);

    await waitFor(() => {
      expect(entriesApi.search).toHaveBeenLastCalledWith('milk', {
        skip: 20,
        limit: 20,
        category: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      });
    });

    expect(await screen.findByText(/showing 21 of 21/i)).toBeInTheDocument();
  });

  it('uses local_date for the open day link when present', async () => {
    (entriesApi.search as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'entry-1',
          transcript: 'late night note',
          recorded_at: '2026-04-11T07:30:00Z',
          created_at: '2026-04-11T07:30:00Z',
          local_date: '2026-04-10',
          match_sources: ['transcript'],
          duration_seconds: 30,
          categories: [{ id: 'cat-1', text: 'late night note', category: 'REFLECTION' }],
        },
      ],
      total: 1,
      skip: 0,
      limit: 20,
    });

    renderSearchPage('/search?q=late');

    expect(await screen.findByRole('link', { name: /open day/i })).toHaveAttribute('href', '/?date=2026-04-10');
  });

  it('shows a clipped transcript snippet around the match', async () => {
    (entriesApi.search as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'entry-1',
          transcript: 'I had a long day at work. After the design review I realized the onboarding flow is too confusing for new users. Need to simplify the first-run checklist and maybe remove the permissions wall. Also remember to send the metrics update.',
          recorded_at: '2026-04-10T09:30:00Z',
          created_at: '2026-04-10T09:30:00Z',
          local_date: '2026-04-10',
          match_sources: ['transcript'],
          duration_seconds: 30,
          categories: [{ id: 'cat-1', text: 'onboarding flow is too confusing', category: 'REFLECTION' }],
        },
      ],
      total: 1,
      skip: 0,
      limit: 20,
    });

    const { container } = renderSearchPage('/search?q=onboarding');

    await screen.findByText(/matched transcript/i);
    expect(container).toHaveTextContent(/onboarding flow is too confusing/i);
    expect(screen.queryByText(/i had a long day at work/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/also remember to send the metrics update/i)).not.toBeInTheDocument();
  });

  it('shows a warning for an invalid date range and skips the request', () => {
    renderSearchPage('/search?q=milk&date_from=2026-04-10&date_to=2026-04-01');

    expect(screen.getByText(/start date needs to be on or before the end date/i)).toBeInTheDocument();
    expect(entriesApi.search).not.toHaveBeenCalled();
  });

  it('shows an empty state when nothing matches', async () => {
    (entriesApi.search as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      skip: 0,
      limit: 20,
    });

    renderSearchPage('/search?q=milk');

    expect(await screen.findByText(/no matching records yet/i)).toBeInTheDocument();
  });

  it('shows category metadata provenance when the category matched', async () => {
    (entriesApi.search as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'entry-1',
          transcript: 'finished the sprint review',
          recorded_at: '2026-04-10T09:30:00Z',
          created_at: '2026-04-10T09:30:00Z',
          local_date: '2026-04-10',
          match_sources: ['category_name'],
          duration_seconds: 30,
          categories: [{ id: 'cat-1', text: 'finished the sprint review', category: 'TODO' }],
        },
      ],
      total: 1,
      skip: 0,
      limit: 20,
    });

    renderSearchPage('/search?q=todo');

    expect(await screen.findByText(/matched category/i)).toBeInTheDocument();
  });

  it('shows an API error state', async () => {
    (entriesApi.search as jest.Mock).mockRejectedValue(new Error('Backend exploded'));

    renderSearchPage('/search?q=milk');

    expect(await screen.findByText(/backend exploded/i)).toBeInTheDocument();
  });
});
