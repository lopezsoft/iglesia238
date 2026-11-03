import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { buildDashboardCsv, dashboardCsvFilename } from './dashboard-export';
import { DashboardSummary } from './dashboard.models';
import { DashboardRepository } from './dashboard.repository';
import { HttpDashboardRepository } from './http-dashboard.repository';
import { NO_COMPARISON, compareWithPrevious, describeRange, formatWidgetValue } from './widget-format';

describe('HttpDashboardRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks GET /api/dashboard/summary for the period and returns the body as is', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DashboardRepository, useClass: HttpDashboardRepository },
      ],
    });
    const result = firstValueFrom(TestBed.inject(DashboardRepository).summary('7d'));

    const request = TestBed.inject(HttpTestingController).expectOne(
      (req) => req.url === '/api/dashboard/summary',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('period')).toBe('7d');
    request.flush({ period: '7d', kpis: [] });

    expect(await result).toMatchObject({ period: '7d' });
  });
});

describe('widget-format', () => {
  it('writes values by format', () => {
    expect(formatWidgetValue(1250000, 'currency')).toContain('1.250.000');
    expect(formatWidgetValue(12345, 'integer')).toBe('12.345');
    expect(formatWidgetValue('Sin sesiones', 'text')).toBe('Sin sesiones');
    expect(formatWidgetValue('ya escrito', 'integer')).toBe('ya escrito');
  });

  it('compares with the previous period and never invents a percentage', () => {
    expect(compareWithPrevious(12, 8)).toEqual({ text: '+50 %', tone: 'up' });
    expect(compareWithPrevious(6, 8)).toEqual({ text: '−25 %', tone: 'down' });
    expect(compareWithPrevious(8, 8)).toEqual({ text: '0 %', tone: 'neutral' });
    expect(compareWithPrevious(8, null)).toBe(NO_COMPARISON);
    expect(compareWithPrevious(8, 0)).toBe(NO_COMPARISON);
  });

  it('describes a day and a range', () => {
    expect(describeRange({ from: '2026-11-02', to: '2026-11-02' })).toBe('Lunes, 2 de noviembre de 2026');
    expect(describeRange({ from: '2026-10-27', to: '2026-11-02' })).toContain('–');
  });
});

describe('buildDashboardCsv', () => {
  const summary = {
    period: 'today',
    periodLabel: 'Hoy',
    previousLabel: 'ayer',
    asOf: '2026-11-02',
    range: { from: '2026-11-02', to: '2026-11-02' },
    scope: { kind: 'CONGREGATION', label: 'Sede "Norte", centro', denominationName: null },
    hero: {
      key: 'h',
      priority: 1,
      eyebrow: 'e',
      title: 't',
      label: 'Aportes',
      value: 1500000,
      format: 'currency',
      previous: 1000000,
      series: [],
      link: null,
    },
    kpis: [
      {
        key: 'k',
        order: 1,
        tab: 'general',
        label: '=SUMA(1;1)',
        value: 3,
        format: 'integer',
        hint: null,
        icon: 'users',
        tone: 'slate',
        link: null,
        previous: null,
      },
    ],
    panels: [],
    lists: [],
    trends: [],
    unavailable: [],
  } as unknown as DashboardSummary;

  it('lists scope, period and figures, with quoted cells and a byte order mark for spreadsheets', () => {
    const csv = buildDashboardCsv(summary);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Alcance,"Sede ""Norte"", centro"');
    expect(csv).toContain('Periodo,Hoy (2026-11-02 a 2026-11-02)');
    expect(csv).toContain('Principal,Aportes,');
    expect(csv).toContain('Anterior (ayer)');
  });

  it('keeps a text from being read as a formula', () => {
    expect(buildDashboardCsv(summary)).toContain("'=SUMA(1;1)");
  });

  it('names the file after the period and the day', () => {
    expect(dashboardCsvFilename(summary)).toBe('resumen-today-2026-11-02.csv');
  });
});
