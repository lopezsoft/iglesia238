import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth/auth.service';
import { ROLE_NAMES } from '../core/auth/role';
import { scopeKey } from '../core/auth/session.model';
import { DebugService } from '../core/debug/debug.service';
import { visibleNavGroups } from '../core/navigation/navigation';
import { IconComponent } from '../shared/ui/icon.component';

/** Authenticated layout: sidebar filtered by permissions, scope selector and the page. */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  host: { '(document:keydown.escape)': 'closeMenu()' },
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly debug = inject(DebugService);

  protected readonly demoMode = environment.demoMode;
  protected readonly user = this.auth.user;
  protected readonly activeScope = this.auth.activeScope;
  protected readonly navGroups = computed(() => {
    this.auth.permissions();
    return visibleNavGroups((permissions) => this.auth.canAny(permissions));
  });
  protected readonly roleNames = computed(() => this.auth.activeRoles().map((role) => ROLE_NAMES[role]));
  protected readonly scopes = computed(() =>
    (this.user()?.selectableScopes ?? []).map((scope) => ({ key: scopeKey(scope), scope })),
  );
  protected readonly activeScopeKey = computed(() => {
    const scope = this.activeScope();
    return scope ? scopeKey(scope) : '';
  });
  protected readonly initials = computed(() =>
    (this.user()?.displayName ?? '')
      .replace(/^Pastor(a)?\s+/, '')
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase(),
  );
  protected readonly menuOpen = signal(false);

  private readonly injector = inject(Injector);
  private readonly sidebar = viewChild.required<ElementRef<HTMLElement>>('sidebar');
  private readonly menuToggle = viewChild.required<ElementRef<HTMLButtonElement>>('menuToggle');
  private readonly mainContent = viewChild.required<ElementRef<HTMLElement>>('mainContent');

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (this.menuOpen()) {
          // The focused link is hidden with the menu: continue in the new page.
          this.menuOpen.set(false);
          this.mainContent().nativeElement.focus();
        }
      });
  }

  /** The fragment href would reload '/' because of <base href="/">: focus <main> instead. */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.mainContent().nativeElement.focus();
  }

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu();
      return;
    }
    this.menuOpen.set(true);
    afterNextRender(() => this.sidebar().nativeElement.querySelector<HTMLElement>('a[href], button')?.focus(), {
      injector: this.injector,
    });
  }

  /** Closes the mobile menu and returns focus to its toggle. */
  protected closeMenu(): void {
    if (!this.menuOpen()) {
      return;
    }
    this.menuOpen.set(false);
    this.menuToggle().nativeElement.focus();
  }

  protected changeScope(key: string): void {
    const target = this.scopes().find((option) => option.key === key);
    if (!target) {
      return;
    }
    this.auth.selectScope(target.scope);
    // The current module may not be allowed in the new scope: start again from the home page.
    void this.router.navigateByUrl('/dashboard');
  }

  protected logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: (error: unknown) => this.debug.error('Logout failed', error),
    });
  }
}
