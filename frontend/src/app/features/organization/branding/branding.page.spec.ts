import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../../core/errors/domain-error';
import { Branding } from './data/branding.models';
import { BrandingRepository } from './data/branding.repository';
import { BrandingPage } from './branding.page';

const KEY = 'branding/1/logo-3f9a1c0b5d7e2a46.png';
const BASE: Branding = {
  denominationName: 'Iglesia Cristiana Monte de Sion',
  logoKey: null,
  primaryColor: null,
  defaultColor: '#1f56c4',
  limits: {
    logoMaxBytes: 512 * 1024,
    logoMinDimension: 32,
    logoMaxDimension: 2000,
    minContrast: 4.5,
  },
};

class FakeRepository extends BrandingRepository {
  state: Branding = BASE;
  readonly uploads: string[] = [];
  readonly colors: (string | null)[] = [];
  removed = 0;
  failWith: DomainError | null = null;

  private respond(change: Partial<Branding>): Observable<Branding> {
    if (this.failWith) {
      return throwError(() => this.failWith);
    }
    this.state = { ...this.state, ...change };
    return of(this.state);
  }
  get() {
    return of(this.state);
  }
  uploadLogo(contentBase64: string) {
    this.uploads.push(contentBase64);
    return this.respond({ logoKey: KEY });
  }
  removeLogo() {
    this.removed += 1;
    return this.respond({ logoKey: null });
  }
  updateColor(primaryColor: string | null) {
    this.colors.push(primaryColor);
    return this.respond({ primaryColor });
  }
}

async function render(initial: Partial<Branding> = {}) {
  const repository = new FakeRepository();
  repository.state = { ...BASE, ...initial };
  TestBed.configureTestingModule({
    providers: [{ provide: BrandingRepository, useValue: repository }],
  });
  const fixture = TestBed.createComponent(BrandingPage);
  const host = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };
  fixture.detectChanges();
  await settle();
  const field = <T extends HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;
  const click = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    );
    if (!button) {
      throw new Error(`No button "${label}"`);
    }
    button.click();
    await settle();
  };
  const typeColor = async (value: string) => {
    const input = field<HTMLInputElement>('brand-color-text');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const pick = async (file: File) => {
    const input = field<HTMLInputElement>('logo-file');
    Object.defineProperty(input, 'files', {
      value: { 0: file, length: 1, item: () => file },
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  return {
    repository,
    host,
    field,
    click,
    typeColor,
    pick,
    text: () => host.textContent ?? '',
    settle,
  };
}

const png = (size = 100, type = 'image/png') =>
  new File([new Uint8Array(size).fill(7)], 'logo.png', { type });

describe('BrandingPage', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  it('shows the denomination, its current logo and the limits of the form', async () => {
    const { host, text } = await render({ logoKey: KEY, primaryColor: '#8b0000' });

    expect(host.querySelector('img.branding__logo')?.getAttribute('src')).toBe(
      `/api/public/${KEY}`,
    );
    expect(text()).toContain('Iglesia Cristiana Monte de Sion');
    expect(text()).toContain('máximo 512 KB');
    expect(text()).toContain('Quitar el logo');
    expect((host.querySelector('#brand-color-text') as HTMLInputElement).value).toBe('#8b0000');
  });

  it('says there is no logo yet and offers no way to remove one', async () => {
    const { text } = await render();

    expect(text()).toContain('Aún no hay logo');
    expect(text()).not.toContain('Quitar el logo');
  });

  it('previews the picked file and uploads its base64 on save', async () => {
    const { repository, host, pick, click, text } = await render();

    await pick(png(3));
    expect(host.querySelector('img[alt="Vista previa del logo nuevo"]')).not.toBeNull();

    await click('Guardar logo');

    expect(repository.uploads).toEqual([btoa(String.fromCharCode(7, 7, 7))]);
    expect(text()).toContain('Logo guardado');
    expect(host.querySelector('img[alt="Vista previa del logo nuevo"]')).toBeNull();
    expect(host.querySelector('img.branding__logo')?.getAttribute('src')).toBe(
      `/api/public/${KEY}`,
    );
  });

  it('cancels the picked file without uploading anything', async () => {
    const { repository, host, pick, click } = await render();

    await pick(png());
    await click('Cancelar');

    expect(host.querySelector('img[alt="Vista previa del logo nuevo"]')).toBeNull();
    expect(repository.uploads).toEqual([]);
  });

  it('refuses a file that is too big or not a PNG or JPEG before the server sees it', async () => {
    const { repository, host, pick, text } = await render();

    await pick(png(600 * 1024));
    expect(text()).toContain('máximo 512 KB');

    await pick(png(100, 'image/svg+xml'));
    expect(text()).toContain('PNG o JPEG');

    expect(host.querySelector('img[alt="Vista previa del logo nuevo"]')).toBeNull();
    expect(repository.uploads).toEqual([]);
  });

  it('removes the logo', async () => {
    const { repository, click, host, text } = await render({ logoKey: KEY });

    await click('Quitar el logo');

    expect(repository.removed).toBe(1);
    expect(text()).toContain('Logo quitado');
    expect(host.querySelector('img.branding__logo')).toBeNull();
  });

  it('saves a valid color in the format the server expects', async () => {
    const { repository, typeColor, click, text } = await render();

    await typeColor('#8B0000');
    await click('Guardar color');

    expect(repository.colors).toEqual(['#8B0000']);
    expect(text()).toContain('Color guardado');
  });

  it('does not let a color that is too light or malformed be saved, and explains why', async () => {
    const { repository, typeColor, host, text } = await render();
    const save = () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Guardar color')!;

    await typeColor('#ffff00');
    expect(text()).toContain('demasiado claro');
    expect(save().disabled).toBe(true);

    await typeColor('rojo');
    expect(text()).toContain('#RRGGBB');
    expect(save().disabled).toBe(true);

    expect(repository.colors).toEqual([]);
  });

  it('keeps "save" off while the color has not changed', async () => {
    const { host } = await render({ primaryColor: '#8b0000' });

    const save = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Guardar color',
    )!;
    expect(save.disabled).toBe(true);
  });

  it('goes back to the default color', async () => {
    const { repository, click, field } = await render({ primaryColor: '#8b0000' });

    await click('Usar el color por defecto');

    expect(repository.colors).toEqual([null]);
    expect(field<HTMLInputElement>('brand-color-text').value).toBe('');
  });

  it('shows the message of the server when a change is rejected, and keeps what was typed', async () => {
    const { repository, typeColor, click, text, field } = await render();
    repository.failWith = new DomainError(
      'COLOR_LOW_CONTRAST',
      'El color es demasiado claro para el servidor.',
      400,
    );

    await typeColor('#8b0000');
    await click('Guardar color');

    expect(text()).toContain('El color es demasiado claro para el servidor.');
    expect(field<HTMLInputElement>('brand-color-text').value).toBe('#8b0000');
  });
});
