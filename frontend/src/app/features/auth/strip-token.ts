import { Router } from '@angular/router';

/**
 * The one-time token arrives in the address (`?token=`) because it travels in an e-mailed link. Once the
 * page has read it, take it out of the URL so it does not stay in the browser history, a copied address or
 * the Referer of a later navigation. The page keeps its own copy.
 */
export function stripTokenFromUrl(router: Router): void {
  void router.navigate([], {
    queryParams: { token: null },
    queryParamsHandling: 'merge',
    replaceUrl: true,
  });
}
