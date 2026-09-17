import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderElement } from '../test/renderRoute';
import { HelpTooltip } from './HelpTooltip';

afterEach(cleanup);

function renderHelp() {
  return renderElement(
    <HelpTooltip label="Ingredients help">
      <p>Drag a highlight&apos;s edge to correct a wrong split.</p>
    </HelpTooltip>,
  );
}

describe('<HelpTooltip>', () => {
  it('is closed until the glyph is clicked, then shows its content', () => {
    renderHelp();

    expect(screen.queryByRole('group', { name: 'Ingredients help' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ingredients help' }));

    expect(screen.getByRole('group', { name: 'Ingredients help' })).toBeInTheDocument();
    expect(screen.getByText(/drag a highlight/i)).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the glyph', () => {
    renderHelp();
    const trigger = screen.getByRole('button', { name: 'Ingredients help' });
    fireEvent.click(trigger);
    expect(screen.getByRole('group', { name: 'Ingredients help' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('group', { name: 'Ingredients help' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on an outside click', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Ingredients help' }));
    expect(screen.getByRole('group', { name: 'Ingredients help' })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('group', { name: 'Ingredients help' })).not.toBeInTheDocument();
  });

  it('does not close on a click inside the popover', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Ingredients help' }));

    fireEvent.mouseDown(screen.getByText(/drag a highlight/i));

    expect(screen.getByRole('group', { name: 'Ingredients help' })).toBeInTheDocument();
  });
});
