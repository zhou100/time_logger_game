import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WeeklyReportPage from './WeeklyReportPage';
import { capturesApi, entriesApi } from '../services/api';

jest.mock('../services/api', () => ({
  capturesApi: {
    list: jest.fn(),
    patch: jest.fn(),
  },
  entriesApi: {
    getAvailableWeeks: jest.fn(),
    getWeeklyAudit: jest.fn(),
    generateWeeklyAudit: jest.fn(),
    listThemes: jest.fn(),
    updateTheme: jest.fn(),
  },
}));

function renderWeeklyReportPage() {
  return render(
    <MemoryRouter>
      <WeeklyReportPage />
    </MemoryRouter>
  );
}

describe('WeeklyReportPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (capturesApi.list as jest.Mock).mockResolvedValue([]);
    (entriesApi.listThemes as jest.Mock).mockResolvedValue([]);
    (entriesApi.getAvailableWeeks as jest.Mock).mockResolvedValue([
      {
        week_start: '2026-04-06',
        week_end: '2026-04-12',
        entry_count: 41,
        has_report: true,
      },
    ]);
  });

  it('renders the full coach letter before the short draft status update', async () => {
    (entriesApi.getWeeklyAudit as jest.Mock).mockResolvedValue({
      entries: 41,
      breakdown: {},
      approximate: false,
      audit_text: [
        'Paragraph one: the real week had enough signal to deserve more than one sentence.',
        'Paragraph two: the user protected two build blocks and shipped the validator.',
        'Paragraph three: childcare-heavy days still compressed the project into leftover cracks.',
        'Paragraph four: next week, protect one recurring build block before admin work.',
      ].join('\n\n'),
      report_json: {
        time_breakdown: {
          activity: {},
          captures: {},
          best_day: null,
          worst_day: null,
          naval_balance: null,
        },
        open_loops: [],
        recurring_themes: [],
        draft_status_update: 'Short uncomfortable truth only.',
      },
      generated_at: '2026-04-12T12:00:00Z',
      cached: true,
      week_start: '2026-04-06',
      week_end: '2026-04-12',
      days_covered: 7,
    });

    renderWeeklyReportPage();

    await waitFor(() => {
      expect(entriesApi.getWeeklyAudit).toHaveBeenCalledWith('2026-04-06');
    });

    expect(await screen.findByText(/paragraph one: the real week/i)).toBeInTheDocument();
    expect(screen.getByText(/paragraph two: the user protected/i)).toBeInTheDocument();
    expect(screen.getByText(/paragraph three: childcare-heavy/i)).toBeInTheDocument();
    expect(screen.getByText(/paragraph four: next week/i)).toBeInTheDocument();
    expect(screen.queryByText('Short uncomfortable truth only.')).not.toBeInTheDocument();
  });

  it('renders a Thought Gems card linking to /thoughts for the selected week', async () => {
    (entriesApi.getAvailableWeeks as jest.Mock).mockResolvedValue([
      {
        week_start: '2026-04-13',
        week_end: '2026-04-19',
        entry_count: 22,
        has_report: true,
      },
      {
        week_start: '2026-04-06',
        week_end: '2026-04-12',
        entry_count: 41,
        has_report: true,
      },
    ]);
    (entriesApi.getWeeklyAudit as jest.Mock).mockResolvedValue({
      entries: 22,
      breakdown: {},
      approximate: false,
      audit_text: null,
      report_json: null,
      generated_at: '2026-04-19T12:00:00Z',
      cached: true,
      week_start: '2026-04-13',
      week_end: '2026-04-19',
      days_covered: 7,
    });

    renderWeeklyReportPage();

    const link = await screen.findByRole('link', { name: /thought gems/i });
    expect(link).toHaveAttribute('href', '/thoughts?week_start=2026-04-13');
  });

  it('keeps themes, open loops, and coach letter visible alongside the Thought Gems card', async () => {
    (capturesApi.list as jest.Mock).mockResolvedValue([
      {
        id: 'loop-1',
        entry_id: 'e-loop-1',
        category: 'TODO',
        display_text: 'ship weekly letter validator',
        status: 'open',
        edited: false,
        source_date: '2026-04-10',
        classified_at: '2026-04-10T09:00:00Z',
      },
    ]);
    (entriesApi.listThemes as jest.Mock).mockResolvedValue([
      {
        id: 'theme-1',
        title: 'deep-work mornings',
        description: 'protect the first block before admin',
        polarity: 'positive',
        category: null,
        first_seen: '2026-04-06',
        last_seen: '2026-04-12',
        occurrences: 3,
        status: 'active',
        user_note: null,
        evidence: [],
      },
    ]);
    (entriesApi.getWeeklyAudit as jest.Mock).mockResolvedValue({
      entries: 41,
      breakdown: {},
      approximate: false,
      audit_text: 'A grounded weekly letter that survives regressions.',
      report_json: {
        time_breakdown: {
          activity: { LEARNING: 40, EARNING: 30 },
          captures: { TODO: 2 },
          best_day: null,
          worst_day: null,
          naval_balance: null,
        },
        open_loops: [],
        recurring_themes: [],
        draft_status_update: 'fallback',
      },
      generated_at: '2026-04-12T12:00:00Z',
      cached: true,
      week_start: '2026-04-06',
      week_end: '2026-04-12',
      days_covered: 7,
    });

    renderWeeklyReportPage();

    expect(
      await screen.findByText(/grounded weekly letter that survives regressions/i)
    ).toBeInTheDocument();
    expect(screen.getByText('deep-work mornings')).toBeInTheDocument();
    expect(screen.getByText('ship weekly letter validator')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /thought gems/i })
    ).toBeInTheDocument();
  });

  it('falls back to the draft status update when no coach letter exists', async () => {
    (entriesApi.getWeeklyAudit as jest.Mock).mockResolvedValue({
      entries: 41,
      breakdown: {},
      approximate: false,
      audit_text: null,
      report_json: {
        time_breakdown: {
          activity: {},
          captures: {},
          best_day: null,
          worst_day: null,
          naval_balance: null,
        },
        open_loops: [],
        recurring_themes: [],
        draft_status_update: 'Short uncomfortable truth only.',
      },
      generated_at: '2026-04-12T12:00:00Z',
      cached: true,
      week_start: '2026-04-06',
      week_end: '2026-04-12',
      days_covered: 7,
    });

    renderWeeklyReportPage();

    expect(await screen.findByText('Short uncomfortable truth only.')).toBeInTheDocument();
  });
});
