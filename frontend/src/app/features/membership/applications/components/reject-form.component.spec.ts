import { TestBed } from '@angular/core/testing';
import { RejectFormComponent } from './reject-form.component';

async function render() {
  const fixture = TestBed.createComponent(RejectFormComponent);
  const reasons: string[] = [];
  fixture.componentInstance.submitted.subscribe((reason) => reasons.push(reason));
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const write = async (value: string) => {
    const textarea = element.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { element, reasons, write };
}

describe('RejectFormComponent', () => {
  it('tells the reviewer the reason is an internal note, not something the applicant reads', async () => {
    const { element } = await render();

    expect(element.textContent).toContain('Es una nota interna');
    expect(element.textContent).toContain('el solicitante no la ve');
    expect(element.textContent).not.toContain('El solicitante verá este motivo');
    expect(element.textContent).not.toContain('adjunto');
  });

  it('asks for a reason of at least ten characters', async () => {
    const { element, reasons, write } = await render();

    await write('  corto  ');

    expect(reasons).toEqual([]);
    expect(element.textContent).toContain('Escribe un motivo de entre 10 y 255 caracteres.');
  });

  it('emits the trimmed reason', async () => {
    const { reasons, write } = await render();

    await write('  El documento no coincide con la persona.  ');

    expect(reasons).toEqual(['El documento no coincide con la persona.']);
  });
});
