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
import { AuthService } from '../core/auth/auth.service';
import { visibleNavGroups } from '../core/navigation/navigation';
import { IconComponent } from '../shared/ui/icon.component';
import { AppFooterComponent } from './app-footer.component';
import { QuickCreateMenuComponent } from './quick-create-menu.component';
import { ScopeSwitcherComponent } from './scope-switcher.component';
import { StatusClusterComponent } from './status-cluster.component';
import { UserMenuComponent } from './user-menu.component';

/**
 * Authenticated layout: white icon rail filtered by permissions, top bar (quick create, scope
 * switcher, status icons, user menu), the page and the footer.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    AppFooterComponent,
    QuickCreateMenuComponent,
    ScopeSwitcherComponent,
    StatusClusterComponent,
    UserMenuComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  host: { '(document:keydown.escape)': 'closeMenu()' },
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly activeScope = this.auth.activeScope;
  protected readonly navGroups = computed(() => {
    this.auth.permissions();
    return visibleNavGroups((permissions) => this.auth.canAny(permissions));
  });
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
}
