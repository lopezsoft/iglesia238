import type { AccountNature, ContributionCategory } from './template.types.js';

/**
 * What every new denomination starts with, in one place. Changing the product defaults means editing
 * this object, not the code that provisions it. Tithe percentages are NOT here on purpose: each
 * denomination enters its own in the accounting setup.
 */
export interface TemplateAccount {
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNature;
  /** Groups only organize the chart: they never receive movements. */
  readonly isPostable: boolean;
  /** Code of the group this account hangs from. */
  readonly parentCode: string | null;
}

export interface TemplateContributionType {
  readonly category: ContributionCategory;
  readonly code: string;
  readonly name: string;
  /** Account that receives this kind of contribution; must exist in `accounts`. */
  readonly accountCode: string;
}

export interface TemplateCertificateType {
  readonly code: string;
  readonly name: string;
}

export interface DenominationTemplate {
  readonly fundName: string;
  readonly accounts: readonly TemplateAccount[];
  readonly contributionTypes: readonly TemplateContributionType[];
  readonly certificateTypes: readonly TemplateCertificateType[];
  readonly pastoralRanks: readonly string[];
  readonly churchPositions: readonly string[];
  readonly privacyPolicy: {
    readonly version: string;
    readonly content: string;
  };
}

/**
 * Starting text of the privacy policy. It is stored as a DRAFT: the screen warns that it must be reviewed
 * before publishing, and the text itself carries nothing but the policy, because what is published is
 * what applicants read and accept.
 */
export const PRIVACY_POLICY_DRAFT = `POLÍTICA DE TRATAMIENTO DE DATOS PERSONALES

1. Responsable. La denominación y sus sedes son responsables del tratamiento de los datos personales que usted entrega al solicitar su membresía.

2. Finalidad. Sus datos se usan para llevar el registro de miembros, emitir certificaciones y carnés, contactarle sobre la vida de la iglesia y cumplir obligaciones legales y contables.

3. Datos sensibles. Los datos de familia, salud o situación socioeconómica solo se tratan con su autorización expresa y para fines pastorales. Usted no está obligado a entregarlos.

4. Menores de edad. Los datos de menores solo se tratan con la autorización de su representante legal.

5. Sus derechos. Usted puede conocer, actualizar, rectificar y solicitar la supresión de sus datos, y revocar esta autorización, escribiendo a la sede donde está registrado (Ley 1581 de 2012).

6. Vigencia. Los datos se conservan mientras usted mantenga su vínculo con la iglesia y el tiempo que exijan las normas.`;

export const DENOMINATION_TEMPLATE: DenominationTemplate = {
  fundName: 'Fondo Local',
  accounts: [
    {
      code: '4',
      name: 'Ingresos',
      nature: 'INCOME',
      isPostable: false,
      parentCode: null,
    },
    {
      code: '41',
      name: 'Ingresos por aportes',
      nature: 'INCOME',
      isPostable: false,
      parentCode: '4',
    },
    {
      code: '410505',
      name: 'Diezmos',
      nature: 'INCOME',
      isPostable: true,
      parentCode: '41',
    },
    {
      code: '410510',
      name: 'Ofrendas',
      nature: 'INCOME',
      isPostable: true,
      parentCode: '41',
    },
    {
      code: '410515',
      name: 'Primicias',
      nature: 'INCOME',
      isPostable: true,
      parentCode: '41',
    },
    {
      code: '410520',
      name: 'Votos',
      nature: 'INCOME',
      isPostable: true,
      parentCode: '41',
    },
    {
      code: '5',
      name: 'Egresos',
      nature: 'EXPENSE',
      isPostable: false,
      parentCode: null,
    },
    {
      code: '53',
      name: 'Transferencias y sostenimiento',
      nature: 'EXPENSE',
      isPostable: false,
      parentCode: '5',
    },
    {
      code: '530505',
      name: 'Cuota de la denominación por diezmos',
      nature: 'EXPENSE',
      isPostable: true,
      parentCode: '53',
    },
    {
      code: '530510',
      name: 'Sostenimiento pastoral',
      nature: 'EXPENSE',
      isPostable: true,
      parentCode: '53',
    },
    {
      code: '51',
      name: 'Gastos de funcionamiento',
      nature: 'EXPENSE',
      isPostable: false,
      parentCode: '5',
    },
    {
      code: '510505',
      name: 'Servicios públicos',
      nature: 'EXPENSE',
      isPostable: true,
      parentCode: '51',
    },
    {
      code: '510520',
      name: 'Papelería y útiles',
      nature: 'EXPENSE',
      isPostable: true,
      parentCode: '51',
    },
  ],
  contributionTypes: [
    {
      category: 'TITHE',
      code: 'DIEZMO',
      name: 'Diezmo',
      accountCode: '410505',
    },
    {
      category: 'OFFERING',
      code: 'OFRENDA',
      name: 'Ofrenda',
      accountCode: '410510',
    },
    {
      category: 'FIRST_FRUITS',
      code: 'PRIMICIA',
      name: 'Primicia',
      accountCode: '410515',
    },
    { category: 'VOW', code: 'VOTO', name: 'Voto', accountCode: '410520' },
  ],
  certificateTypes: [
    { code: 'MEM', name: 'Certificado de membresía' },
    { code: 'TRA', name: 'Carta de traslado' },
    { code: 'BAU', name: 'Certificado de bautismo' },
    { code: 'ASI', name: 'Certificado de asistencia' },
    { code: 'DON', name: 'Certificado de donaciones' },
  ],
  pastoralRanks: ['Pastor', 'Evangelista', 'Misionero', 'Obrero'],
  churchPositions: [
    'Pastor',
    'Anciano',
    'Diácono',
    'Secretario(a)',
    'Tesorero(a)',
    'Maestro(a) de escuela dominical',
  ],
  privacyPolicy: { version: '1.0', content: PRIVACY_POLICY_DRAFT },
};
