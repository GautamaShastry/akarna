import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FixtureApplication } from './main';

afterEach(() => {
  cleanup();
});

describe('fixture application', () => {
  it('renders profile controls and exposes disabled, hidden, and sensitive fixtures', () => {
    render(<FixtureApplication />);
    expect(screen.getByLabelText(/Full name/)).toBeVisible();
    expect(screen.getByLabelText(/Recruiter code/)).toBeDisabled();
    expect(screen.getByLabelText(/Government ID/)).toBeVisible();
    expect(document.getElementById('hidden-field')).not.toBeVisible();
  });

  it('keeps controlled values through navigation and reveals conditional fields', () => {
    render(<FixtureApplication />);
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: Education' }));
    fireEvent.change(screen.getByLabelText(/Highest degree/), { target: { value: 'masters' } });
    fireEvent.change(screen.getByLabelText(/Graduation date/), { target: { value: '2025-12-15' } });
    fireEvent.click(screen.getByLabelText(/Will need sponsorship/));
    expect(screen.getByLabelText(/Sponsorship details/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Next: Review/ }));
    expect(screen.getByText('Ada Lovelace')).toBeVisible();
    expect(screen.getByText('masters')).toBeVisible();
  });

  it('shows a server-style validation failure and succeeds with valid review', () => {
    render(<FixtureApplication />);
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Server Error' } });
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: Education' }));
    fireEvent.change(screen.getByLabelText(/Highest degree/), { target: { value: 'masters' } });
    fireEvent.change(screen.getByLabelText(/Graduation date/), { target: { value: '2025-12-15' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Review/ }));
    fireEvent.click(screen.getByLabelText(/I confirm/));
    fireEvent.click(screen.getByRole('button', { name: /Submit application/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be submitted/);
  });
});
