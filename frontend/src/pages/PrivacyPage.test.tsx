/**
 * Tests for the static /privacy disclosure page.
 *
 * Covers:
 *  - Renders without an AuthProvider (page is unauthenticated by design).
 *  - Each of the four required sections has a heading.
 *  - "Back to landing" link resolves to /.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrivacyPage from './PrivacyPage';

function renderPage() {
    return render(
        <MemoryRouter>
            <PrivacyPage />
        </MemoryRouter>,
    );
}

describe('PrivacyPage', () => {
    it('renders without auth context (no AuthProvider in tree)', () => {
        // Plain MemoryRouter only — no AuthProvider, no QueryClientProvider.
        // If the component required either, this render() would throw.
        const { container } = renderPage();
        expect(container).toBeTruthy();
        expect(screen.getByRole('heading', { name: /^privacy$/i })).toBeInTheDocument();
    });

    it('renders the 24-hour retention section', () => {
        renderPage();
        expect(
            screen.getByRole('heading', { name: /24-hour retention/i }),
        ).toBeInTheDocument();
        expect(screen.getByText(/24 hours after creation/i)).toBeInTheDocument();
    });

    it('renders the OpenAI processing section', () => {
        renderPage();
        expect(
            screen.getByRole('heading', { name: /openai processing/i }),
        ).toBeInTheDocument();
        expect(screen.getByText(/whisper for transcription/i)).toBeInTheDocument();
        expect(screen.getByText(/gpt-4o-mini/i)).toBeInTheDocument();
        expect(screen.getByText(/not used to train/i)).toBeInTheDocument();
    });

    it('renders the IP addresses section', () => {
        renderPage();
        expect(
            screen.getByRole('heading', { name: /ip addresses/i }),
        ).toBeInTheDocument();
        expect(screen.getByText(/never store raw ips/i)).toBeInTheDocument();
        expect(screen.getByText(/sha-256/i)).toBeInTheDocument();
        expect(screen.getByText(/14 days/i)).toBeInTheDocument();
    });

    it('renders the "no persistent anonymous account" section', () => {
        renderPage();
        expect(
            screen.getByRole('heading', { name: /no persistent anonymous account/i }),
        ).toBeInTheDocument();
        expect(screen.getByText(/24-hour cookie/i)).toBeInTheDocument();
    });

    it('"Back to landing" link points at /', () => {
        renderPage();
        const link = screen.getByRole('link', { name: /back to landing/i });
        expect(link).toHaveAttribute('href', '/');
    });
});
