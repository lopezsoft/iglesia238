import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { userMessage } from '../../core/errors/domain-error';
import { DialogComponent } from '../../shared/ui/dialog.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  ReadOnlyNoticeComponent,
} from '../../shared/ui/feedback.components';
import { IconComponent } from '../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SectionPanelComponent } from '../../shared/ui/section-panel.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { PolicyFormDialogComponent } from './components/policy-form-dialog.component';
import {
  POLICY_STATE_LABELS,
  POLICY_STATE_TONES,
  PrivacyPolicy,
  PrivacyPolicyDraft,
  suggestNextVersion,
} from './data/privacy-policy.models';
import { PrivacyPolicyRepository } from './data/privacy-policy.repository';

type Confirmation = { readonly kind: 'publish' | 'delete'; readonly policy: PrivacyPolicy };

/**
 * Policy of data processing (Ley 1581 de 2012) of the denomination: drafts, publication and the
 * history of versions. Applicants accept the current one; without it the public form is closed.
 */
@Component({
  selector: 'app-privacy-policy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    PageHeaderComponent,
    StatCardComponent,
    SectionPanelComponent,
    StatusBadgeComponent,
    DialogComponent,
    IconComponent,
    LoadingComponent,
    ErrorBannerComponent,
    EmptyStateComponent,
    ReadOnlyNoticeComponent,
    PolicyFormDialogComponent,
  ],
  templateUrl: './privacy-policy.page.html',
  styleUrl: './privacy-policy.page.scss',
})
export class PrivacyPolicyPage {
  private readonly repository = inject(PrivacyPolicyRepository);
  private readonly auth = inject(AuthService);

  protected readonly userMessage = userMessage;
  protected readonly stateLabels = POLICY_STATE_LABELS;
  protected readonly stateTones = POLICY_STATE_TONES;
  protected readonly canManage = computed(() => this.auth.can('congregations.manage'));

  protected readonly policies = rxResource({
    params: () => ({ tenant: this.auth.tenant() }),
    stream: () => this.repository.list(),
  });

  protected readonly items = computed(() => (this.policies.hasValue() ? this.policies.value().items : []));
  protected readonly hasCurrent = computed(
    () => this.policies.hasValue() && this.policies.value().hasCurrentPolicy,
  );
  protected readonly current = computed(() => this.items().find((policy) => policy.isCurrent) ?? null);
  protected readonly draftCount = computed(() => this.items().filter((policy) => policy.status === 'DRAFT').length);
  protected readonly consentTotal = computed(() =>
    this.items().reduce((sum, policy) => sum + policy.consentCount, 0),
  );
  protected readonly applicationTotal = computed(() =>
    this.items().reduce((sum, policy) => sum + policy.applicationCount, 0),
  );
  protected readonly suggestedVersion = computed(() =>
    suggestNextVersion(this.items().map((policy) => policy.version)),
  );

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<PrivacyPolicy | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly previewing = signal<PrivacyPolicy | null>(null);
  protected readonly confirmation = signal<Confirmation | null>(null);
  protected readonly pending = signal(false);
  protected readonly commandError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected newVersion(): void {
    this.editing.set(null);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected edit(policy: PrivacyPolicy): void {
    this.editing.set(policy);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected async save(draft: PrivacyPolicyDraft): Promise<void> {
    const editing = this.editing();
    const command = editing ? this.repository.update(editing.id, draft) : this.repository.create(draft);
    this.formError.set(null);
    const saved = await this.run(command, (message) => this.formError.set(message));
    if (saved) {
      this.formOpen.set(false);
      this.notice.set(
        editing
          ? `Borrador ${saved.value.version} actualizado.`
          : `Borrador ${saved.value.version} creado. Publícalo cuando esté listo para que los solicitantes lo acepten.`,
      );
    }
  }

  protected ask(kind: Confirmation['kind'], policy: PrivacyPolicy): void {
    this.commandError.set(null);
    this.confirmation.set({ kind, policy });
  }

  protected async confirm(): Promise<void> {
    const current = this.confirmation();
    if (!current) {
      return;
    }
    if (current.kind === 'publish') {
      const published = await this.run(this.repository.publish(current.policy.id), (message) =>
        this.commandError.set(message),
      );
      if (published) {
        const policy = published.value;
        this.notice.set(
          policy.isCurrent
            ? `La versión ${policy.version} ya es la política vigente: los solicitantes la aceptan desde ahora.`
            : `La versión ${policy.version} quedó programada y regirá desde el ${policy.effectiveFrom.split('-').reverse().join('/')}.`,
        );
      }
    } else {
      const removed = await this.run(this.repository.remove(current.policy.id), (message) =>
        this.commandError.set(message),
      );
      if (removed) {
        this.notice.set(`Borrador ${current.policy.version} eliminado.`);
      }
    }
    if (this.commandError() === null) {
      this.confirmation.set(null);
    }
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  /** Runs a command and reloads the list; returns its result, or null (after reporting) on failure. */
  private async run<T>(
    command: Observable<T>,
    onError: (message: string) => void,
  ): Promise<{ readonly value: T } | null> {
    this.pending.set(true);
    this.notice.set(null);
    try {
      const value = await firstValueFrom(command);
      this.policies.reload();
      return { value };
    } catch (error) {
      onError(userMessage(error));
      return null;
    } finally {
      this.pending.set(false);
    }
  }
}
