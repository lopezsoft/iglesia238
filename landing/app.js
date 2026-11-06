(function () {
  const root = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const langEs = document.getElementById('langEs');
  const langEn = document.getElementById('langEn');

  // En local (localhost / 127.0.0.1), apunta los botones hacia http://localhost:4700;
  // en producción (iglesia238.com), apunta hacia https://app.iglesia238.com.
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const appBase = isLocal ? 'http://localhost:4700' : 'https://app.iglesia238.com';

  document.querySelectorAll('[data-app-path]').forEach((el) => {
    const path = el.getAttribute('data-app-path');
    if (path) {
      el.setAttribute('href', appBase + path);
    }
  });

  // Tema claro / oscuro
  const savedTheme = localStorage.getItem('ig238-theme') || 'light';
  root.setAttribute('data-theme', savedTheme);
  if (themeToggle) {
    themeToggle.textContent = savedTheme === 'dark' ? '☾' : '☀';
    themeToggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('ig238-theme', next);
      themeToggle.textContent = next === 'dark' ? '☾' : '☀';
    });
  }

  // Diccionario ES / EN
  const translations = {
    es: {
      'nav.solutions': 'Soluciones',
      'nav.f701': 'F-701 Digital',
      'nav.how': 'Cómo funciona',
      'nav.security': 'Seguridad',
      'nav.faq': 'Preguntas',
      'nav.login': 'Iniciar sesión',
      'nav.registerSede': 'Registrar mi sede',
      'hero.badgeAccent': 'Plataforma Multi-Sede 2026:',
      'hero.badgeText': 'Membresía F-701, Secretaría y Contabilidad →',
      'hero.title':
        'La plataforma que organiza el <span class="hero__title-highlight">crecimiento</span> de tu iglesia, sin trámites en papel',
      'hero.subtitle':
        'Integra tu <strong>membresía oficial (F-701)</strong>, libro de registro, certificados en PDF, asistencia, diezmos, votos y libro de caja por sede y denominación en un solo lugar.',
      'hero.ctaPrimary': 'Registrar mi sede →',
      'hero.ctaSecondary': 'Solicitar membresía',
      'hero.subnote': 'Activación inmediata por sede · ¿Ya enviaste tu solicitud?',
      'hero.statusLink': 'Consultar estado con mi código →',
      'trust.multi': 'Multi-denominación y multi-sede',
      'trust.law': 'Ley 1581 de 2012 · Habeas Data',
      'trust.certs': 'Certificados y carnés en PDF',
      'trust.accounting': 'Libro de caja, diezmos y votos',
      'float1.title': 'Membresía F-701 Digital',
      'float1.desc': 'Inscripción en línea y asignación de consecutivo',
      'card.kpi1Label': 'Miembros y familias activas',
      'card.kpi1Sub': 'proyección nacional de sedes conectadas',
      'card.kpi2Sub': 'países y 9.229 municipios integrados',
      'float2.title': '100 % Trazable por Sede',
      'float2.desc': 'Certificados, carnés y traslados entre sedes',
      'float3.title': 'Recibos REC y Diezmos',
      'float3.desc': 'Consolidación automática en libro de caja',
      'roles.tag': 'Diseñado para cada ministerio',
      'roles.title': 'Cada rol ve exactamente lo que necesita en su sede o denominación',
      'roles.subtitle':
        'Control de acceso granular con cambio de alcance en un clic entre toda la denominación o una congregación local.',
      'cta.title': 'Impulsa el orden y la transparencia de tu congregación hoy',
      'cta.subtitle':
        'Accede desde cualquier computador o celular a la plataforma diseñada para iglesias y denominaciones en Latinoamérica.',
      'cta.primary': 'Registrar mi sede ahora →',
      'cta.secondary': 'Ingresar a app.iglesia238.com',
    },
    en: {
      'nav.solutions': 'Solutions',
      'nav.f701': 'Digital F-701',
      'nav.how': 'How it works',
      'nav.security': 'Security',
      'nav.faq': 'FAQ',
      'nav.login': 'Sign in',
      'nav.registerSede': 'Register my congregation',
      'hero.badgeAccent': 'Multi-Congregation Platform 2026:',
      'hero.badgeText': 'F-701 Membership, Secretariat & Accounting →',
      'hero.title':
        'The platform that organizes your church <span class="hero__title-highlight">growth</span>, paperless',
      'hero.subtitle':
        'Unify your <strong>official membership (F-701)</strong>, registry book, PDF certificates, attendance, tithes, vows and cash book per congregation and denomination in one place.',
      'hero.ctaPrimary': 'Register my congregation →',
      'hero.ctaSecondary': 'Apply for membership',
      'hero.subnote': 'Instant activation per congregation · Already applied?',
      'hero.statusLink': 'Check status with my code →',
      'trust.multi': 'Multi-denomination & multi-congregation',
      'trust.law': 'Data Privacy Law 1581 Compliant',
      'trust.certs': 'PDF Certificates & ID Cards',
      'trust.accounting': 'Cash book, tithes & vows',
      'float1.title': 'Digital F-701 Membership',
      'float1.desc': 'Online application & official registry number',
      'card.kpi1Label': 'Active members & families',
      'card.kpi1Sub': 'national projection of connected congregations',
      'card.kpi2Sub': 'countries & 9,229 municipalities integrated',
      'float2.title': '100% Traceable per Congregation',
      'float2.desc': 'Certificates, ID cards & inter-church transfers',
      'float3.title': 'REC Receipts & Tithes',
      'float3.desc': 'Automatic cash book consolidation',
      'roles.tag': 'Built for every ministry role',
      'roles.title': 'Every role sees exactly what it needs in its congregation or denomination',
      'roles.subtitle':
        'Granular access control with one-click scope switching between the entire denomination or a local congregation.',
      'cta.title': 'Bring order and transparency to your congregation today',
      'cta.subtitle':
        'Access from any computer or phone the platform built for churches and denominations across Latin America.',
      'cta.primary': 'Register my congregation now →',
      'cta.secondary': 'Sign in to app.iglesia238.com',
    },
  };

  function setLanguage(lang) {
    const dict = translations[lang] || translations.es;
    root.setAttribute('lang', lang);
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key && dict[key]) {
        el.textContent = dict[key];
      }
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      if (key && dict[key]) {
        el.innerHTML = dict[key];
      }
    });
    if (langEs && langEn) {
      langEs.classList.toggle('active', lang === 'es');
      langEn.classList.toggle('active', lang === 'en');
    }
  }

  if (langEs && langEn) {
    langEs.addEventListener('click', () => setLanguage('es'));
    langEn.addEventListener('click', () => setLanguage('en'));
  }
})();
