import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, switchMap, timer } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  CertificateListItem,
  IssuingContext,
  MemberOption,
  NOTES_MAX_LENGTH,
} from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';
import { CertificateDocumentComponent } from './certificate-document.component';
import { MemberSearchComponent } from './member-search.component';

const PREVIEW_DEBOUNCE_MS = 300;

/** Issue form with the preview of the printed certificate, built by the server. */
@Component({
  selector: 'app-certificate-issue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    IconComponent,
    MemberSearchComponent,
    CertificateDocumentComponent,
  ],
  templateUrl: './certificate-issue.component.html',
  styleUrl: './certificate-issue.component.scss',
})
export class CertificateIssueComponent {
  readonly context = input.required<IssuingContext>();
  readonly preselectedMember = input<MemberOption | null>(null);
  readonly issued = output<CertificateListItem>();

  private readonly repo = inject(CertificatesRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly notesMaxLength = NOTES_MAX_LENGTH;
  protected readonly form = this.fb.group({
    certificateTypeId: this.fb.control(0, [Validators.required, Validators.min(1)]),
    notes: this.fb.control('', [Validators.maxLength(NOTES_MAX_LENGTH)]),
  });
  protected readonly member = linkedSignal<MemberOption | null>(() => this.preselectedMember());
  protected readonly memberMissing = signal(false);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly selectedType = computed(() => {
    const id = this.formValue().certificateTypeId;
    return this.context().types.find((type) => type.id === id) ?? null;
  });

  /** The baptism certificate needs a registered baptism (the API checks it again). */
  protected readonly baptismMissing = computed(
    () =>
      this.selectedType()?.code === 'BAU' && this.member() !== null && !this.member()?.isBaptized,
  );

  /** The server prints the preview: the text always matches what will be issued. */
  protected readonly previewResource = rxResource({
    params: () => {
      const member = this.member();
      const typeId = this.formValue().certificateTypeId ?? 0;
      return member !== null && typeId > 0 && !this.baptismMissing()
        ? {
            memberId: member.id,
            certificateTypeId: typeId,
            notes: (this.formValue().notes ?? '').trim() || null,
            // Issuing moves the next number: ask again after each emission.
            nextNumber: this.selectedType()?.nextNumber ?? '',
          }
        : undefined;
    },
    stream: ({ params }) =>
      timer(PREVIEW_DEBOUNCE_MS).pipe(
        switchMap(() =>
          this.repo.preview({
            memberId: params.memberId,
            certificateTypeId: params.certificateTypeId,
            notes: params.notes,
          }),
        ),
      ),
  });
  protected readonly preview = computed(() =>
    this.previewResource.hasValue() ? this.previewResource.value() : null,
  );
  protected readonly previewError = computed(() =>
    this.previewResource.error() ? userMessage(this.previewResource.error()) : null,
  );

  constructor() {
    // Default to the first type of the denomination once the context arrives.
    effect(() => {
      const types = this.context().types;
      const current = this.form.controls.certificateTypeId.value;
      if (types.length > 0 && !types.some((type) => type.id === current)) {
        this.form.controls.certificateTypeId.setValue(types[0].id);
      }
    });
  }

  protected onMemberChange(member: MemberOption | null): void {
    this.member.set(member);
    this.memberMissing.set(false);
    this.success.set(null);
  }

  protected reset(): void {
    this.member.set(null);
    this.memberMissing.set(false);
    this.error.set(null);
    this.success.set(null);
    this.form.controls.notes.reset('');
  }

  protected async submit(): Promise<void> {
    const member = this.member();
    this.memberMissing.set(member === null);
    if (member === null || this.form.invalid || this.baptismMissing()) {
      this.form.markAllAsTouched();
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      const { certificateTypeId, notes } = this.form.getRawValue();
      const certificate = await firstValueFrom(
        this.repo.issueCertificate({
          memberId: member.id,
          certificateTypeId,
          notes: notes.trim() || null,
        }),
      );
      this.success.set(`Certificado ${certificate.number} emitido para ${certificate.memberName}.`);
      this.member.set(null);
      this.form.controls.notes.reset('');
      this.issued.emit(certificate);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
