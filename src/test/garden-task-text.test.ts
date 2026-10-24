import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { taskText } from '@/lib/garden-task-text';

const t = i18n.getFixedT('en', 'huerta');
const tomato = t('crops.tomato');

describe('what a garden task says', () => {
  it('a frost names the crops to cover', () => {
    expect(
      taskText({ kind: 'frost', level: 'frost', crops: ['tomato'] }, t, 'en')
    ).toEqual({
      title: 'Frost in the next 3 days',
      text: `Cover ${tomato} on the cold nights.`,
      from: 'forecast',
    });
  });

  it('a later frost names its night', () => {
    expect(
      taskText(
        { kind: 'laterFrost', night: '2026-10-24', crops: ['tomato'] },
        t,
        'en'
      ).title
    ).toBe('Frost possible Saturday night');
  });

  it('watering follows the soil', () => {
    expect(
      taskText({ kind: 'water', mm: 12, soil: 'clay' }, t, 'en').text
    ).toMatch(/^Clay holds water/);
  });

  it('a care step names its crop', () => {
    expect(
      taskText({ kind: 'stage', crop: 'tomato', step: 'feed' }, t, 'en').title
    ).toBe(`${tomato}: feed every week or two`);
  });

  it('plant now lists the crops as its text', () => {
    const said = taskText(
      { kind: 'plantNow', crops: ['garlic', 'tomato'] },
      t,
      'en'
    );
    expect(said.text).toBe(`${t('crops.garlic')}, ${tomato}`);
    expect(said.from).toBe('plan');
  });
});
