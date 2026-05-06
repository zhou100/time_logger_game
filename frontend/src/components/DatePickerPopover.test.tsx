import React from 'react';
import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DatePickerPopover from './DatePickerPopover';

function renderPicker(props?: Partial<React.ComponentProps<typeof DatePickerPopover>>) {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);

    const onClose = vi.fn();
    const onSelect = vi.fn();

    render(
        <DatePickerPopover
            anchorEl={anchor}
            onClose={onClose}
            selectedDate="2026-03-15"
            activeDates={new Set(['2026-03-12'])}
            maxDate="2026-04-11"
            onSelect={onSelect}
            {...props}
        />
    );

    return { onClose, onSelect };
}

describe('DatePickerPopover', () => {
    it('selects an empty date and closes the picker', () => {
        const { onClose, onSelect } = renderPicker();

        fireEvent.click(screen.getByText('10'));

        expect(onSelect).toHaveBeenCalledWith('2026-03-10');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('allows next-month navigation when the next month starts before maxDate', () => {
        renderPicker();

        act(() => {
            fireEvent.click(screen.getByRole('button', { name: /next/i }));
        });

        expect(screen.getByText('April 2026')).toBeInTheDocument();
    });

    it('disables next-month navigation when the next month starts after maxDate', () => {
        renderPicker({ selectedDate: '2026-04-10', maxDate: '2026-04-11' });

        expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });
});
