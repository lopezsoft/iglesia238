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
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { buildCertificateSnapshot } from '../data/certificate-document';
import {
  CertificateListItem,
  CertificateSnapshot,
  IssuingContext,
  MemberOption,
  NOTES_MAX_LENGTH,
} from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';
import { CertificateDocumentComponent } from './certificate-document.component';
import { MemberSearchComponent } from './member-search.component';

/** Issue form with the live preview of the printed certificate. */
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

  /** The baptism certificate needs a registered baptism (checked again by the data source). */
  protected readonly baptismMissing = computed(
    () =>
      this.selectedType()?.code === 'BAU' && this.member() !== null && !this.member()?.isBaptized,
  );

  protected readonly preview = computed<CertificateSnapshot>(() => {
    const context = this.context();
    const type = this.selectedType() ?? context.types[0];
    const member = this.member();
    const placeholder: MemberOption = {
      id: 0,
      fullName: '',
      code: '',
      documentLabel: '',
      joinedOn: null,
      isBaptized: false,
      waterBaptismOn: null,
    };
    const snapshot = buildCertificateSnapshot({
      number: type?.nextNumber ?? '—',
      typeCode: type?.code ?? '',
      typeName: type?.name ?? '',
      issuedOn: context.today,
      letterhead: context.letterhead,
      signers: context.signers,
      issuedByName: context.issuedByName,
      member: member ?? placeholder,
      notes: this.formValue().notes ?? null,
    });
    return member ? snapshot : { ...snapshot, body: '' };
  });

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
