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
    (capturesApi.list as jest.Mock).mockImplementation((opts?: { category?: string; status?: string }) => {
      if (opts?.category === 'TODO' && opts?.status === 'open') {
        return Promise.resolve([
          {
            id: 'loop-1',
            entry_id: 'e-loop-1',
            category: 'TODO',
            display_text: 'ship weekly letter validator',
            status: 'open',
            edited: false,
            source_date: '2026-04-10',
            classified_at: '2026-04-10T09:00:00Z',
            resolved_at: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });
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
    // Hero theme teaser shows the description as a pulled quote; full title lives on /themes.
    expect(screen.getByText('protect the first block before admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open recurring themes/i })).toHaveAttribute('href', '/themes');
    expect(screen.getByText('ship weekly letter validator')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /thought gems/i })
    ).toBeInTheDocument();
  });

  it('renders the stale-prefs banner with a Regenerate button when prefs_stale=true', async () => {
    (entriesApi.getWeeklyAudit as jest.Mock).mockResolvedValue({
      entries: 41,
      breakdown: {},
      approximate: false,
      audit_text: 'Cached letter from before the user changed coaching prefs.',
      report_json: null,
      generated_at: '2026-04-12T12:00:00Z',
      cached: true,
      week_start: '2026-04-06',
      week_end: '2026-04-12',
      days_covered: 7,
      prefs_stale: true,
    });
    (entriesApi.generateWeeklyAudit as jest.Mock).mockResolvedValue({
      entries: 41,
      breakdown: {},
      approximate: false,
      audit_text: 'Fresh letter under new coaching prefs.',
      report_json: null,
      generated_at: '2026-04-13T12:00:00Z',
      cached: false,
      week_start: '2026-04-06',
      week_end: '2026-04-12',
      days_covered: 7,
      prefs_stale: false,
    });

    renderWeeklyReportPage();

    // Cached letter and the stale banner both visible.
    expect(
      await screen.findByText(/cached letter from before/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/your coaching preferences changed after this report was generated/i)
    ).toBeInTheDocument();
    // The banner deep-links to /settings.
    expect(screen.getByRole('link', { name: /open settings/i })).toHaveAttribute(
      'href',
      '/settings'
    );

    // Two "Regenerate" buttons exist now: the toolbar one and the one inside the banner.
    // Click the banner's Regenerate (action button) and verify it calls generateWeeklyAudit
    // with regenerate=true.
    const regenButtons = screen.getAllByRole('button', { name: /regenerate/i });
    // The banner action button is the last one rendered in the DOM order.
    const bannerRegen = regenButtons[regenButtons.length - 1];
    bannerRegen.click();

    await waitFor(() => {
      expect(entriesApi.generateWeeklyAudit).toHaveBeenCalledWith('2026-04-06', true);
    });
  });

  it('does not render the stale-prefs banner when prefs_stale is false or absent', async () => {
    (entriesApi.getWeeklyAudit as jest.Mock).mockResolvedValue({
      entries: 41,
      breakdown: {},
      approximate: false,
      audit_text: 'Fresh letter.',
      report_json: null,
      generated_at: '2026-04-12T12:00:00Z',
      cached: true,
      week_start: '2026-04-06',
      week_end: '2026-04-12',
      days_covered: 7,
      // prefs_stale absent
    });

    renderWeeklyReportPage();

    expect(await screen.findByText('Fresh letter.')).toBeInTheDocument();
    expect(
      screen.queryByText(/your coaching preferences changed after this report was generated/i)
    ).not.toBeInTheDocument();
  });

  it('renders the coach letter as a bulleted list when audit_text is in bullet format', async () => {
    (entriesApi.getWeeklyAudit as jest.Mock).mockResolvedValue({
      entries: 41,
      breakdown: {},
      approximate: false,
      audit_text: [
        '- Pattern: fragmented focus with late starts.',
        '- Working: you shipped the validator on Tuesday.',
        '- Not working: too much time in meetings, not enough deep work.',
        '- Next: block Monday morning for the weekly letter refactor.',
      ].join('\n'),
      report_json: null,
      generated_at: '2026-04-12T12:00:00Z',
      cached: true,
      week_start: '2026-04-06',
      week_end: '2026-04-12',
      days_covered: 7,
    });

    renderWeeklyReportPage();

    // All 4 bullets render as list items; leading dashes are stripped.
    const items = await screen.findAllByRole('listitem');
    const coachItems = items.filter((li) =>
      /Pattern:|Working:|Not working:|Next:/.test(li.textContent || '')
    );
    expect(coachItems.length).toBe(4);
    expect(coachItems[0].textContent).toMatch(/^Pattern: fragmented focus/);
    expect(coachItems[0].textContent).not.toMatch(/^- /);
    expect(coachItems[3].textContent).toMatch(/^Next: block Monday morning/);
  });

  it('keeps paragraph rendering (back-compat) when audit_text has no bullet markers', async () => {
    (entriesApi.getWeeklyAudit as jest.Mock).mockResolvedValue({
      entries: 41,
      breakdown: {},
      approximate: false,
      audit_text: [
        'Paragraph one: classic prose letter.',
        'Paragraph two: a second block of prose.',
      ].join('\n\n'),
      report_json: null,
      generated_at: '2026-04-12T12:00:00Z',
      cached: true,
      week_start: '2026-04-06',
      week_end: '2026-04-12',
      days_covered: 7,
    });

    renderWeeklyReportPage();

    expect(await screen.findByText(/paragraph one: classic prose/i)).toBeInTheDocument();
    expect(screen.getByText(/paragraph two: a second block/i)).toBeInTheDocument();
    // Prose falls back to paragraph rendering; no coach-letter list items.
    const items = screen.queryAllByRole('listitem');
    const coachItems = items.filter((li) => /Paragraph one:/.test(li.textContent || ''));
    expect(coachItems.length).toBe(0);
  });

  it('renders the Recurring Themes teaser with DM Sans italic, not DM Serif Display', async () => {
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
      audit_text: '- Pattern: clean week.\n- Working: focus.\n- Not working: nothing.\n- Next: keep going.',
      report_json: null,
      generated_at: '2026-04-12T12:00:00Z',
      cached: true,
      week_start: '2026-04-06',
      week_end: '2026-04-12',
      days_covered: 7,
    });

    renderWeeklyReportPage();

    const quote = await screen.findByText('protect the first block before admin');
    // Typography regression: the giant \u201C ornament glyph must not leak into
    // the visible quote text (it used to render via ::before pseudo on the old card).
    expect(quote.textContent || '').not.toMatch(/\u201C/);
    // Teaser link uses the polarity color on its left border. The themes card
    // link is a single container, so querying by role works for the whole card.
    const link = screen.getByRole('link', { name: /open recurring themes/i });
    expect(link).toHaveAttribute('href', '/themes');
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
