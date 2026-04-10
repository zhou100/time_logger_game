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
          transcript: 'buy milk after work',
          recorded_at: '2026-04-10T09:30:00Z',
          created_at: '2026-04-10T09:30:00Z',
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
  });

  it('loads more results when requested', async () => {
    (entriesApi.search as jest.Mock)
      .mockResolvedValueOnce({
        items: Array.from({ length: 20 }, (_, index) => ({
          id: `entry-${index}`,
          transcript: `milk note ${index}`,
          recorded_at: '2026-04-10T09:30:00Z',
          created_at: '2026-04-10T09:30:00Z',
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
});
