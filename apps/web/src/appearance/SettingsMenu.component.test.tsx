import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PopoverGroup } from '../shell/PopoverGroup';
import { AppearanceProvider } from './AppearanceProvider';
import { SettingsMenu } from './SettingsMenu';

function renderMenu() {
  return render(
    <AppearanceProvider>
      <PopoverGroup>
        <SettingsMenu />
      </PopoverGroup>
    </AppearanceProvider>,
  );
}

const gear = () => screen.getByRole('button', { name: /settings/i });
const dialog = () => screen.queryByRole('dialog', { name: /appearance/i });
const darkSwitch = () => screen.getByRole('switch', { name: /dark mode/i });

function storedPref() {
  const raw = localStorage.getItem('dtg.appearance');
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.palette;
});
afterEach(cleanup);

describe('<SettingsMenu>', () => {
  it('opens on gear click and reports aria-expanded', () => {
    renderMenu();
    expect(dialog()).not.toBeInTheDocument();
    fireEvent.click(gear());
    expect(dialog()).toBeInTheDocument();
    expect(gear()).toHaveAttribute('aria-expanded', 'true');
  });

  it('stays open while toggling dark and changing palette', () => {
    renderMenu();
    fireEvent.click(gear());

    fireEvent.click(darkSwitch());
    expect(dialog()).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'sage' } });
    expect(dialog()).toBeInTheDocument();
  });

  it('closes on an outside click', () => {
    renderMenu();
    fireEvent.click(gear());
    expect(dialog()).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(dialog()).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    renderMenu();
    fireEvent.click(gear());
    expect(dialog()).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog()).not.toBeInTheDocument();
  });

  it('toggling dark applies data-theme on <html> and persists with updatedAt', () => {
    renderMenu();
    fireEvent.click(gear());
    fireEvent.click(darkSwitch());

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(darkSwitch()).toHaveAttribute('aria-checked', 'true');

    const pref = storedPref();
    expect(pref?.mode).toBe('dark');
    expect(typeof pref?.updatedAt).toBe('number');
    expect(pref?.updatedAt as number).toBeGreaterThan(0);

    // back to light removes the attribute
    fireEvent.click(darkSwitch());
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(storedPref()?.mode).toBe('light');
  });

  it('changing palette applies data-palette on <html> and persists', () => {
    renderMenu();
    fireEvent.click(gear());
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'plum' } });

    expect(document.documentElement.dataset.palette).toBe('plum');
    expect(storedPref()?.palette).toBe('plum');
  });

  it('the flanking Light / Dark labels set the mode directly', () => {
    renderMenu();
    fireEvent.click(gear());

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
