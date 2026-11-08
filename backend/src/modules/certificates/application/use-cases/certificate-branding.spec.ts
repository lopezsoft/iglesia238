import { png } from '../../../../../test/support/images.js';
import {
  CENTRAL,
  buildWorld,
  secretaryOf,
  seedCard,
  type World,
} from '../testing/certificates-test-world.js';

const secretary = secretaryOf(CENTRAL);
const MEMBER_ANA = 1;
const MEM = 1;

const LOGO_KEY = 'branding/1/logo-aaaaaaaaaaaaaaaa.png';
const OTHER_LOGO_KEY = 'branding/1/logo-bbbbbbbbbbbbbbbb.png';
const LOGO = png(120, 60);
const OTHER_LOGO = png(64, 64);

/** A world where the denomination has chosen a dark red and uploaded a logo. */
function brandedWorld(): World {
  const world = buildWorld();
  world.data.branding = { logoKey: LOGO_KEY, primaryColor: '#8b0000' };
  world.data.files.set(LOGO_KEY, LOGO);
  world.data.files.set(OTHER_LOGO_KEY, OTHER_LOGO);
  return world;
}

function issue(world: World) {
  return world.useCases.issue.execute(secretary, {
    memberId: MEMBER_ANA,
    certificateTypeId: MEM,
    notes: null,
  });
}

const snapshotOf = (world: World, id: number) =>
  world.data.certificates.find((c) => c.id === id)!.snapshot;

describe('the identity of the denomination on the certificates', () => {
  it('is stored in the snapshot with the certificate when it is issued', async () => {
    const world = brandedWorld();

    const issued = await issue(world);

    expect(snapshotOf(world, issued.id).branding).toEqual({
      logoKey: LOGO_KEY,
      primaryColor: '#8b0000',
    });
  });

  it('shows the same identity in the preview', async () => {
    const world = brandedWorld();

    const preview = await world.useCases.preview.execute(secretary, {
      memberId: MEMBER_ANA,
      certificateTypeId: MEM,
      notes: null,
    });

    expect(preview.snapshot.branding).toEqual({
      logoKey: LOGO_KEY,
      primaryColor: '#8b0000',
    });
  });

  it('leaves the snapshot as it always was when the denomination chose nothing', async () => {
    const world = buildWorld();

    const issued = await issue(world);

    expect('branding' in snapshotOf(world, issued.id)).toBe(false);
  });

  it('keeps only what was chosen: a color without logo, or a logo without color', async () => {
    const world = buildWorld();
    world.data.branding = { logoKey: null, primaryColor: '#006400' };
    const colorOnly = await issue(world);
    world.data.branding = { logoKey: LOGO_KEY, primaryColor: null };
    const logoOnly = await issue(world);

    expect(snapshotOf(world, colorOnly.id).branding).toEqual({
      logoKey: null,
      primaryColor: '#006400',
    });
    expect(snapshotOf(world, logoOnly.id).branding).toEqual({
      logoKey: LOGO_KEY,
      primaryColor: null,
    });
  });
});

describe('the PDF of a certificate', () => {
  it('is drawn with the logo and the color of the snapshot', async () => {
    const world = brandedWorld();
    const issued = await issue(world);

    await world.useCases.pdf.execute(secretary, issued.id);

    const input = world.renderer.certificates.at(-1)!;
    expect(input.accentColor).toBe('#8b0000');
    expect(input.logo?.equals(LOGO)).toBe(true);
  });

  it('is identical on every reprint, even after the denomination changed its logo and color', async () => {
    const world = brandedWorld();
    const issued = await issue(world);

    world.data.branding = { logoKey: OTHER_LOGO_KEY, primaryColor: '#000080' };
    await world.useCases.pdf.execute(secretary, issued.id);

    const input = world.renderer.certificates.at(-1)!;
    expect(input.accentColor).toBe('#8b0000');
    expect(input.logo?.equals(LOGO)).toBe(true);
  });

  it('is not dressed up retroactively: a certificate issued before has no identity to print', async () => {
    const world = buildWorld();
    const issued = await issue(world);

    world.data.branding = { logoKey: LOGO_KEY, primaryColor: '#8b0000' };
    world.data.files.set(LOGO_KEY, LOGO);
    await world.useCases.pdf.execute(secretary, issued.id);

    const input = world.renderer.certificates.at(-1)!;
    expect(input.accentColor).toBeUndefined();
    expect(input.logo).toBeUndefined();
  });

  it('is printed without the logo, but with the color, when the file is not in the storage', async () => {
    const world = brandedWorld();
    const issued = await issue(world);
    world.data.files.delete(LOGO_KEY);

    await world.useCases.pdf.execute(secretary, issued.id);

    const input = world.renderer.certificates.at(-1)!;
    expect(input.logo).toBeUndefined();
    expect(input.accentColor).toBe('#8b0000');
  });

  it('is still printed when the storage is down', async () => {
    const world = brandedWorld();
    const issued = await issue(world);
    world.data.storageFailing = true;

    const file = await world.useCases.pdf.execute(secretary, issued.id);

    expect(file.filename).toMatch(/\.pdf$/);
    expect(world.renderer.certificates.at(-1)?.logo).toBeUndefined();
  });

  it('never reads a key that is not a storage key, whatever the snapshot says', async () => {
    const world = brandedWorld();
    const issued = await issue(world);
    const stored = world.data.certificates.find((c) => c.id === issued.id)!;
    stored.snapshot = {
      ...stored.snapshot,
      branding: { logoKey: '../../etc/passwd', primaryColor: '#8b0000' },
    };
    world.data.files.set('../../etc/passwd', Buffer.from('secret'));

    await world.useCases.pdf.execute(secretary, issued.id);

    expect(world.renderer.certificates.at(-1)?.logo).toBeUndefined();
  });
});

describe('the PDF of a membership card', () => {
  it('wears the identity the denomination has now', async () => {
    const world = brandedWorld();
    const card = seedCard(world, CENTRAL, MEMBER_ANA);

    await world.useCases.cardPdf.execute(secretary, card.id);

    const input = world.renderer.cards.at(-1)!;
    expect(input.accentColor).toBe('#8b0000');
    expect(input.logo?.equals(LOGO)).toBe(true);
  });

  it('keeps the default look when the denomination chose nothing', async () => {
    const world = buildWorld();
    const card = seedCard(world, CENTRAL, MEMBER_ANA);

    await world.useCases.cardPdf.execute(secretary, card.id);

    const input = world.renderer.cards.at(-1)!;
    expect(input.accentColor).toBeUndefined();
    expect(input.logo).toBeUndefined();
  });
});
