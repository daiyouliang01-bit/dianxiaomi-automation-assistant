'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('./_setup.js');

let RpaRunStateModel;
let RpaRunState;
try {
    require('../src/state/rpa-run-state.js');
    RpaRunStateModel = global.RpaRunStateModel;
    RpaRunState = global.RpaRunState;
} catch (_) {
    RpaRunStateModel = null;
    RpaRunState = null;
}

test('creates a traceable RPA run in preflight state', () => {
    assert.ok(RpaRunStateModel, 'RpaRunStateModel must expose the run-state reducer');
    const run = RpaRunStateModel.createRun({
        mode: 'normal',
        now: 1700000000000,
        runId: 'run-1',
        storeName: '测试店铺',
        saveDestination: 'pending_publish',
        descriptionCleanupLevel: 'light'
    });

    assert.deepEqual(run, {
        runId: 'run-1',
        mode: 'normal',
        storeName: '测试店铺',
        saveDestination: 'pending_publish',
        descriptionCleanupLevel: 'light',
        status: 'preflight',
        startedAt: 1700000000000,
        updatedAt: 1700000000000,
        products: {},
        events: [{ at: 1700000000000, type: 'run_started', message: 'RPA 已启动，等待图片空间预检。', meta: null }]
    });
});

test('creates collision-resistant run ids even within the same millisecond', () => {
    assert.equal(
        RpaRunStateModel.createRpaRunId(1700000000000, () => 'uuid-one'),
        'rpa-1700000000000-uuid-one'
    );
    assert.notEqual(
        RpaRunStateModel.createRpaRunId(1700000000000, () => 'uuid-one'),
        RpaRunStateModel.createRpaRunId(1700000000000, () => 'uuid-two')
    );
});

test('labels plug and normal mode in the run center', () => {
    assert.ok(RpaRunStateModel, 'RpaRunStateModel must expose the run-state model helpers');

    assert.equal(RpaRunStateModel.modeText('plug'), '插头');
    assert.equal(RpaRunStateModel.modeText('normal'), '普通产品');
});

test('records incomplete products without stopping the rest of the RPA pipeline', () => {
    assert.ok(RpaRunStateModel, 'RpaRunStateModel must expose the run-state reducer');
    let run = RpaRunStateModel.createRun({ mode: 'auto_parts', now: 100, runId: 'run-2' });
    run = RpaRunStateModel.reduce(run, { type: 'status', status: 'running', at: 105 });
    run = RpaRunStateModel.reduce(run, { type: 'batch_opened', urls: ['https://x/edit?id=1', 'https://x/edit?id=2'], at: 110 });
    run = RpaRunStateModel.reduce(run, { type: 'product_result', url: 'https://x/edit?id=1', status: 'success', at: 120, detail: '保存成功' });
    run = RpaRunStateModel.reduce(run, { type: 'product_result', url: 'https://x/edit?id=2', status: 'needs_review', at: 130, detail: '保存未确认' });

    assert.equal(run.products['https://x/edit?id=1'].status, 'success');
    assert.equal(run.products['https://x/edit?id=2'].status, 'needs_review');
    assert.equal(run.status, 'running');
    assert.equal(run.events.at(-1).type, 'product_result');
});

test('builds a completion summary with separate review and failure counts', () => {
    assert.ok(RpaRunStateModel, 'RpaRunStateModel must expose the run-state reducer');
    let run = RpaRunStateModel.createRun({ mode: 'normal', now: 100, runId: 'run-summary' });
    run = RpaRunStateModel.reduce(run, {
        type: 'batch_opened',
        urls: ['https://x/edit?id=1', 'https://x/edit?id=2', 'https://x/edit?id=3'],
        at: 110
    });
    run = RpaRunStateModel.reduce(run, { type: 'product_result', url: 'https://x/edit?id=1', status: 'success', at: 120 });
    run = RpaRunStateModel.reduce(run, { type: 'product_result', url: 'https://x/edit?id=2', status: 'needs_review', at: 130 });
    run = RpaRunStateModel.reduce(run, { type: 'product_result', url: 'https://x/edit?id=3', status: 'failed', at: 140 });

    assert.deepEqual(RpaRunStateModel.summarizeRun(run), {
        total: 3,
        success: 1,
        failed: 1,
        needsReview: 1,
        executionFailed: 1,
        queued: 0,
        paused: 0,
        message: 'RPA 自动处理完成\n成功：1 条\n待确认：1 条\n失败：1 条'
    });
});

test('records a space pause and resumes the same run after image-space recovery', () => {
    assert.ok(RpaRunStateModel, 'RpaRunStateModel must expose the run-state reducer');
    let run = RpaRunStateModel.createRun({ mode: 'normal', now: 100, runId: 'run-3' });
    run = RpaRunStateModel.reduce(run, { type: 'status', status: 'paused_space', message: '图片空间不足', at: 200 });
    run = RpaRunStateModel.reduce(run, { type: 'status', status: 'running', message: '图片空间已恢复至 50M', at: 300 });

    assert.equal(run.status, 'running');
    assert.equal(run.events.at(-1).message, '图片空间已恢复至 50M');
});

test('keeps recording run results when Chrome storage is temporarily unavailable', async () => {
    assert.ok(RpaRunState, 'RpaRunState must be available');
    const originalChrome = global.chrome;
    global.chrome = {};
    try {
        const run = await RpaRunState.start({ mode: 'normal' });
        assert.equal(run.mode, 'normal');
        const stored = await RpaRunState.get();
        assert.equal(stored.runId, run.runId);
    } finally {
        global.chrome = originalChrome;
    }
});

test('loads run state before modules that consume it', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const scripts = manifest.content_scripts[0].js;
    assert.ok(scripts.includes('src/state/rpa-run-state.js'));
    assert.ok(scripts.indexOf('src/state/rpa-run-state.js') < scripts.indexOf('src/workflows/rpa-image-space.js'));
    assert.ok(scripts.indexOf('src/state/rpa-run-state.js') < scripts.indexOf('src/workflows/rpa.js'));
    assert.ok(scripts.indexOf('src/state/rpa-run-state.js') < scripts.indexOf('src/content/main.js'));
});
