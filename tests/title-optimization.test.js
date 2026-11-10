'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TitleOptimization = require('../src/domain/title-optimization.js');

test('normalizes model punctuation to printable ASCII before strict validation', () => {
    assert.equal(
        TitleOptimization.normalizeTitle('Heavy–Duty “Steel” Prop…'),
        'Heavy-Duty "Steel" Prop...'
    );
    assert.equal(TitleOptimization.isValidTitle('Heavy–Duty Steel Prop'), true);
});

test('retries only invalid bulk titles and preserves their original positions', async () => {
    const calls = [];
    const result = await TitleOptimization.repairInvalidTitles({
        sourceTitles: ['原始一', '原始二', '原始三'],
        optimizedTitles: [
            'Adjustable Steel Prop for Concrete Formwork',
            '仍然是中文',
            'A'.repeat(129)
        ],
        maxPasses: 2,
        optimizeBatch: async (titles, pass) => {
            calls.push({ titles, pass });
            return [
                'Heavy Duty Galvanized Shoring Post for Building Support',
                'Industrial Adjustable Scaffolding Prop for Construction'
            ];
        }
    });

    assert.deepEqual(calls, [{ titles: ['原始二', '原始三'], pass: 1 }]);
    assert.deepEqual(result.invalidIndexes, []);
    assert.deepEqual(result.titles, [
        'Adjustable Steel Prop for Concrete Formwork',
        'Heavy Duty Galvanized Shoring Post for Building Support',
        'Industrial Adjustable Scaffolding Prop for Construction'
    ]);
});

test('reports titles that remain invalid after the configured retry passes', async () => {
    let attempts = 0;
    const result = await TitleOptimization.repairInvalidTitles({
        sourceTitles: ['原始标题'],
        optimizedTitles: ['中文结果'],
        maxPasses: 2,
        optimizeBatch: async () => {
            attempts += 1;
            return ['还是中文'];
        }
    });

    assert.equal(attempts, 2);
    assert.deepEqual(result.invalidIndexes, [0]);
    assert.deepEqual(result.titles, ['']);
});

test('background bulk title flow repairs only invalid model results before responding', () => {
    const backgroundSource = fs.readFileSync(
        path.join(__dirname, '../src/background/background.js'),
        'utf8'
    );

    assert.match(backgroundSource, /TitleOptimizationApi\.repairInvalidTitles\s*\(/);
    assert.match(backgroundSource, /SYSTEM_PROMPT_BULK_REPAIR/);
});
