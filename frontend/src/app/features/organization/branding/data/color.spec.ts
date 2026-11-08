import { colorProblem, contrastWithWhite, isHexColor } from './color';

describe('contrastWithWhite', () => {
  it('is 21 for black and 1 for white', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 5);
  });

  it('matches the value the server computes for a known color', () => {
    // The same number the backend spec checks: yellow on white is unreadable.
    expect(contrastWithWhite('#ffff00')).toBeCloseTo(1.07, 1);
  });
});

describe('isHexColor', () => {
  it.each(['#1f56c4', '#1F56C4', '#000000'])('accepts %s', (text) => {
    expect(isHexColor(text)).toBe(true);
  });

  it.each(['1f56c4', '#1f56c', '#1f56c44', '#gggggg', 'blue', ''])('rejects %j', (text) => {
    expect(isHexColor(text)).toBe(false);
  });
});

describe('colorProblem', () => {
  it('has nothing to say about a blank color (the default) or a dark one', () => {
    expect(colorProblem('', 4.5)).toBeNull();
    expect(colorProblem('   ', 4.5)).toBeNull();
    expect(colorProblem('#8b0000', 4.5)).toBeNull();
  });

  it('asks for the #RRGGBB format', () => {
    expect(colorProblem('rojo', 4.5)).toContain('#RRGGBB');
    expect(colorProblem('#12345', 4.5)).toContain('#RRGGBB');
  });

  it('says how much contrast a light color has and how much it needs', () => {
    const message = colorProblem('#ffff00', 4.5);

    expect(message).toContain('demasiado claro');
    expect(message).toContain('1.1:1');
    expect(message).toContain('4.5:1');
  });
});
