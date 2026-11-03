import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpPrivacyPolicyRepository } from './http-privacy-policy.repository';
import { suggestNextVersion } from './privacy-policy.models';

const draft = { version: '2.0', content: 'x'.repeat(80), effectiveFrom: '2026-12-01' };

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), HttpPrivacyPolicyRepository],
  });
  return {
    repository: TestBed.inject(HttpPrivacyPolicyRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpPrivacyPolicyRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists the versions', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.list());
    backend.expectOne('/api/privacy-policies').flush({ items: [], hasCurrentPolicy: false });

    expect(await result).toEqual({ items: [], hasCurrentPolicy: false });
  });

  it('creates, edits, publishes and deletes through their endpoints', async () => {
    const { repository, backend } = setup();

    void firstValueFrom(repository.create(draft));
    const create = backend.expectOne('/api/privacy-policies');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(draft);
    create.flush({ id: 9 });

    void firstValueFrom(repository.update(9, draft));
    const update = backend.expectOne('/api/privacy-policies/9');
    expect(update.request.method).toBe('PUT');
    update.flush({ id: 9 });

    void firstValueFrom(repository.publish(9));
    const publish = backend.expectOne('/api/privacy-policies/9/publish');
    expect(publish.request.method).toBe('POST');
    publish.flush({ id: 9 });

    const removed = firstValueFrom(repository.remove(9));
    const remove = backend.expectOne('/api/privacy-policies/9');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
    expect(await removed).toBeUndefined();
  });
});

describe('suggestNextVersion', () => {
  it('increments the latest numeric version', () => {
    expect(suggestNextVersion([])).toBe('1.0');
    expect(suggestNextVersion(['1.0', '1.4', '1.2'])).toBe('1.5');
    expect(suggestNextVersion(['2'])).toBe('3');
    expect(suggestNextVersion(['1.9', '2.0'])).toBe('2.1');
    expect(suggestNextVersion(['v-especial'])).toBe('1.0');
  });
});
