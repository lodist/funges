import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import i18n from '@/i18n';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ZoomableImage } from '@/components/ZoomableImage';

function renderInDialog(onOpenChange = vi.fn()) {
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{'Recipe'}</DialogTitle>
        <ZoomableImage src='/dish.webp' className='h-32 w-full' />
      </DialogContent>
    </Dialog>
  );
  return onOpenChange;
}

// jsdom runs no CSS animations, so the exit has to be ended by hand.
const finishExit = () =>
  fireEvent.animationEnd(screen.getByTestId('zoomed-image'));

describe('ZoomableImage', () => {
  it('zooms on a page card too, outside any dialog', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    render(
      <ZoomableImage src='/sloes.webp' alt='Sloes' className='h-20 w-20' />
    );
    const thumb = screen.getByRole('button', { name: 'Enlarge image Sloes' });

    await user.click(thumb);
    expect(screen.getByTestId('zoomed-image')).toBeInTheDocument();
    await user.click(document.body);
    finishExit();
    expect(screen.queryByTestId('zoomed-image')).not.toBeInTheDocument();
    expect(thumb).toHaveAttribute('aria-expanded', 'false');
  });

  it('enlarges on click and shrinks on the next press, on the picture or not', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    const onOpenChange = renderInDialog();
    const thumb = screen.getByRole('button', { name: 'Enlarge image' });

    await user.click(thumb);
    expect(thumb).toHaveAttribute('aria-expanded', 'true');
    expect(thumb).toHaveAccessibleName('Shrink image');

    await user.click(screen.getByTestId('zoomed-image'));
    expect(thumb).toHaveAttribute('aria-expanded', 'false');
    finishExit();
    expect(screen.queryByTestId('zoomed-image')).not.toBeInTheDocument();
    // a press while enlarged only shrinks the picture, never the recipe
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shrinks on Escape without closing the dialog, then Escape closes it', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    const onOpenChange = renderInDialog();

    await user.click(screen.getByRole('button', { name: 'Enlarge image' }));
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    finishExit();
    expect(screen.queryByTestId('zoomed-image')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
