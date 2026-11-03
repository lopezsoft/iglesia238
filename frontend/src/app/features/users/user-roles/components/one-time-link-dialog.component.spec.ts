import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OneTimeLink } from '../data/user-roles.models';
import { OneTimeLinkDialogComponent } from './one-time-link-dialog.component';

const LINK: OneTimeLink = {
  link: 'https://app.test/login/accept-invitation?token=abc123',
  expiresAt: '2026-11-05T15:00:00.000Z',
  purpose: 'INVITATION',
  emailDelivered: false,
};

async function render(link: OneTimeLink, recipient = 'Natalia Cárdenas') {
  const fixture: ComponentFixture<OneTimeLinkDialogComponent> = TestBed.createComponent(
    OneTimeLinkDialogComponent,
  );
  fixture.componentRef.setInput('link', link);
  fixture.componentRef.setInput('recipient', recipient);
  fixture.componentRef.setInput('open', true);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

describe('OneTimeLinkDialogComponent', () => {
  beforeAll(() => {
    // jsdom has no native <dialog> modal support.
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('shows the link in a read-only field and tells the administrator to pass it on when the e-mail was not sent', async () => {
    const { element } = await render(LINK);

    const field = element.querySelector<HTMLInputElement>('#one-time-link');
    expect(field?.value).toBe(LINK.link);
    expect(field?.readOnly).toBe(true);
    expect(element.textContent).toContain('El correo no está configurado o no pudo enviarse');
    expect(element.textContent).toContain('Natalia Cárdenas');
    expect(element.textContent).toContain('no se vuelve a mostrar');
  });

  it('does not ask to pass the link on when the e-mail was delivered', async () => {
    const { element } = await render({ ...LINK, emailDelivered: true });

    expect(element.textContent).toContain('También enviamos el enlace al correo');
    expect(element.textContent).not.toContain('El correo no está configurado');
  });

  it('titles a recovery link differently from an invitation', async () => {
    const { element } = await render({ ...LINK, purpose: 'PASSWORD_RESET' });

    expect(element.querySelector('h2')?.textContent).toContain('Enlace de recuperación');
    expect(element.textContent).toContain('Enlace para crear una contraseña nueva');
  });

  it('copies the link to the clipboard and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const { fixture, element } = await render(LINK);

    element.querySelector<HTMLButtonElement>('.link-box .btn')?.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(LINK.link);
    expect(element.querySelector('.link-box .btn')?.textContent).toContain('Copiado');
  });

  it('selects the text for Ctrl+C when the clipboard is not available', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    const { fixture, element } = await render(LINK);

    element.querySelector<HTMLButtonElement>('.link-box .btn')?.click();
    await fixture.whenStable();

    expect(element.textContent).toContain('No pudimos copiarlo automáticamente');
    expect(element.querySelector('.link-box .btn')?.textContent).toContain('Copiar enlace');
  });
});
