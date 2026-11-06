#!/usr/bin/env node
/**
 * Verifica que ningún template o componente de Angular use el atributo HTML nativo `title`
 * (`title="..."`, `[title]="..."`, `[attr.title]="..."`) como tooltip.
 * Todos los tooltips deben usar `[appCustomTooltip]` (`CustomTooltipDirective`).
 */
const fs = require('fs');
const path = require('path');

const candidateRoots = [
  path.resolve(__dirname, '../frontend/src'),
  path.resolve(__dirname, '../src'),
];

const srcRoot = candidateRoots.find((dir) => fs.existsSync(dir));
if (!srcRoot) {
  console.error('No se encontró el directorio src del frontend.');
  process.exit(1);
}

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (
      (entry.name.endsWith('.html') || entry.name.endsWith('.ts')) &&
      !entry.name.endsWith('.spec.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

const violations = [];
const files = walkFiles(srcRoot);

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      return;
    }

    // 1. Asignaciones programáticas directas al atributo nativo title
    if (/\.setAttribute\(\s*['"]title['"]|\.nativeElement\.title\s*=/.test(line)) {
      violations.push({
        file: path.relative(srcRoot, file),
        line: index + 1,
        snippet: trimmed,
      });
      return;
    }

    // 2. Uso de [attr.title]= en plantillas HTML
    if (/\[attr\.title\]\s*=/.test(line)) {
      violations.push({
        file: path.relative(srcRoot, file),
        line: index + 1,
        snippet: trimmed,
      });
      return;
    }

    // 3. Uso de title= o [title]= en elementos HTML nativos (no componentes <app-*>)
    if (/(?:\[title\]|\btitle)\s*=/.test(line)) {
      if (
        /\breadonly\s+title\s*=/.test(line) ||
        /\bviewChild.*\(\s*['"]title['"]\s*\)/.test(line) ||
        /\btitle\s*:\s*/.test(line)
      ) {
        return;
      }
      const contextSlice = lines.slice(Math.max(0, index - 15), index + 1).join('\n');
      const openTags = [...contextSlice.matchAll(/<([a-zA-Z0-9-]+)/g)];
      const currentTag = openTags.length > 0 ? openTags[openTags.length - 1][1] : '';
      if (currentTag && !currentTag.startsWith('app-')) {
        violations.push({
          file: path.relative(srcRoot, file),
          line: index + 1,
          snippet: `<${currentTag}> ${trimmed}`,
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error('❌ Se encontraron usos prohibidos del atributo nativo `title`:');
  for (const v of violations) {
    console.error(`  - ${v.file}:${v.line} -> ${v.snippet}`);
  }
  console.error('Usa siempre la directiva [appCustomTooltip] (CustomTooltipDirective).');
  process.exit(1);
}

console.log('✅ Validación exitosa: 0 usos del atributo HTML nativo `title` en el frontend.');
