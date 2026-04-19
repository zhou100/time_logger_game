import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from './SettingsPage';
import { preferencesApi, PreferencesValidationError } from '../services/api';

jest.mock('../services/api', () => {
  class FakePreferencesValidationError extends Error {
    constructor(fields: any, message?: string) {
      super(message || 'Validation error');
      this.name = 'PreferencesValidationError';
      (this as any).fields = fields;
    }
  }
  return {
    preferencesApi: {
      get: jest.fn(),
      patch: jest.fn(),
    },
    PreferencesValidationError: FakePreferencesValidationError,
  };
});

const defaultPrefs = {
  tone: 'warm' as const,
  pacing: 'actionable' as const,
  language_lock: 'auto' as const,
  avoid_topics: [] as string[],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (preferencesApi.get as jest.Mock).mockResolvedValue(defaultPrefs);
  });

  // ── Loading & error states ───────────────────────────────────────────────
  it('shows a loading indicator while fetching preferences', async () => {
    let resolveGet!: (v: typeof defaultPrefs) => void;
    (preferencesApi.get as jest.Mock).mockImplementation(
      () => new Promise<typeof defaultPrefs>((r) => { resolveGet = r; })
    );
    renderPage();
    expect(screen.getByText(/loading your preferences/i)).toBeInTheDocument();
    resolveGet(defaultPrefs);
    await waitFor(() => {
      expect(screen.queryByText(/loading your preferences/i)).not.toBeInTheDocument();
    });
  });

  it('renders an error with a Retry button when load fails, and refetches on click', async () => {
    (preferencesApi.get as jest.Mock).mockRejectedValueOnce(new Error('Network down'));
    renderPage();

    expect(await screen.findByText('Network down')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /retry/i });

    (preferencesApi.get as jest.Mock).mockResolvedValueOnce(defaultPrefs);
    fireEvent.click(retry);

    expect(await screen.findByText(/how your weekly review sounds/i)).toBeInTheDocument();
    expect(preferencesApi.get).toHaveBeenCalledTimes(2);
  });

  // ── Default render ───────────────────────────────────────────────────────
  it('renders the form with defaults and the empty-topics hint', async () => {
    renderPage();
    expect(await screen.findByText(/how your weekly review sounds/i)).toBeInTheDocument();
    expect(screen.getByText(/no avoided topics yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeEnabled();
  });

  // ── Topic input ──────────────────────────────────────────────────────────
  it('adds a topic when the user types and presses Enter', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(/e\.g\. sleep, weight/i);

    fireEvent.change(input, { target: { value: 'sleep' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('sleep')).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('rejects a duplicate topic case-insensitively without adding a second chip', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(/e\.g\. sleep, weight/i);

    fireEvent.change(input, { target: { value: 'Sleep' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('Sleep')).toBeInTheDocument();

    // Re-add same value with different case — the input clears but no new chip appears.
    fireEvent.change(input, { target: { value: 'sleep' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('');
    });
    expect(screen.getAllByText(/^sleep$/i)).toHaveLength(1);
  });

  it('disables the Add button and shows a helper error when the draft exceeds the 60-char max', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(/e\.g\. sleep, weight/i);
    const addButton = screen.getByRole('button', { name: /^add$/i });

    const tooLong = 'x'.repeat(61);
    fireEvent.change(input, { target: { value: tooLong } });

    expect(screen.getByText(/max 60 characters/i)).toBeInTheDocument();
    expect(addButton).toBeDisabled();
  });

  it('caps the avoid-topics list at MAX_TOPICS (10)', async () => {
    const tenTopics = Array.from({ length: 10 }, (_, i) => `topic-${i + 1}`);
    (preferencesApi.get as jest.Mock).mockResolvedValueOnce({
      ...defaultPrefs,
      avoid_topics: tenTopics,
    });
    renderPage();

    const input = await screen.findByPlaceholderText(/e\.g\. sleep, weight/i);
    const addButton = screen.getByRole('button', { name: /^add$/i });

    expect(input).toBeDisabled();
    expect(addButton).toBeDisabled();
    // All ten chips visible.
    for (const t of tenTopics) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it('removes a topic when the chip delete button is clicked', async () => {
    (preferencesApi.get as jest.Mock).mockResolvedValueOnce({
      ...defaultPrefs,
      avoid_topics: ['weight', 'sleep'],
    });
    renderPage();

    expect(await screen.findByText('weight')).toBeInTheDocument();
    expect(screen.getByText('sleep')).toBeInTheDocument();

    // MUI Chip onDelete renders a CancelIcon button with class MuiChip-deleteIcon.
    const weightChip = screen.getByText('weight').closest('.MuiChip-root') as HTMLElement;
    const deleteIcon = weightChip.querySelector('.MuiChip-deleteIcon') as HTMLElement;
    fireEvent.click(deleteIcon);

    await waitFor(() => {
      expect(screen.queryByText('weight')).not.toBeInTheDocument();
    });
    expect(screen.getByText('sleep')).toBeInTheDocument();
  });

  // ── Save ─────────────────────────────────────────────────────────────────
  it('PATCHes preferences with current values and shows a success banner on save', async () => {
    (preferencesApi.patch as jest.Mock).mockResolvedValue({
      ...defaultPrefs,
      avoid_topics: ['weight'],
    });
    renderPage();
    const input = await screen.findByPlaceholderText(/e\.g\. sleep, weight/i);

    fireEvent.change(input, { target: { value: 'weight' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await screen.findByText(/preferences saved/i);
    expect(preferencesApi.patch).toHaveBeenCalledWith({
      tone: 'warm',
      pacing: 'actionable',
      language_lock: 'auto',
      avoid_topics: ['weight'],
    });
  });

  it('renders per-field validation errors when the API throws PreferencesValidationError', async () => {
    (preferencesApi.patch as jest.Mock).mockRejectedValue(
      new PreferencesValidationError(
        {
          tone: 'Tone is required',
          pacing: 'Pacing is invalid',
          language_lock: 'Language code unknown',
          avoid_topics: 'Too many topics',
        },
        'Some preferences are invalid.'
      )
    );
    renderPage();
    await screen.findByText(/how your weekly review sounds/i);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('Some preferences are invalid.')).toBeInTheDocument();
    expect(screen.getByText('Tone is required')).toBeInTheDocument();
    expect(screen.getByText('Pacing is invalid')).toBeInTheDocument();
    expect(screen.getByText('Language code unknown')).toBeInTheDocument();
    expect(screen.getByText('Too many topics')).toBeInTheDocument();
  });

  it('shows a general error alert when the save fails for a non-422 reason', async () => {
    (preferencesApi.patch as jest.Mock).mockRejectedValue(new Error('Server error. Try again later.'));
    renderPage();
    await screen.findByText(/how your weekly review sounds/i);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('Server error. Try again later.')).toBeInTheDocument();
    expect(screen.queryByText(/preferences saved/i)).not.toBeInTheDocument();
  });

  // ── Reset ────────────────────────────────────────────────────────────────
  it('PATCHes all-null on Reset and re-applies the returned defaults', async () => {
    (preferencesApi.get as jest.Mock).mockResolvedValueOnce({
      ...defaultPrefs,
      avoid_topics: ['weight', 'sleep'],
    });
    (preferencesApi.patch as jest.Mock).mockResolvedValue(defaultPrefs);

    renderPage();
    expect(await screen.findByText('weight')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));

    await waitFor(() => {
      expect(preferencesApi.patch).toHaveBeenCalledWith({
        tone: null,
        pacing: null,
        language_lock: null,
        avoid_topics: null,
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('weight')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/no avoided topics yet/i)).toBeInTheDocument();
  });
});
