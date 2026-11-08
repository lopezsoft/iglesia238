import { Observable } from 'rxjs';
import { Branding } from './branding.models';

/** Port of the visual identity of the denomination of the session. */
export abstract class BrandingRepository {
  abstract get(): Observable<Branding>;
  /** `contentBase64` is the raw base64 of a PNG or a JPEG, without the `data:` prefix. */
  abstract uploadLogo(contentBase64: string): Observable<Branding>;
  abstract removeLogo(): Observable<Branding>;
  /** `null` goes back to the default color of the system. */
  abstract updateColor(primaryColor: string | null): Observable<Branding>;
}
