// ============================================
// config.js — 核心配置区 + 内存变量
// 所有变量挂载到 window 上，供其他模块直接访问
// ============================================

// --- 🛠️ 1. 核心配置区 ---
window.Selectors = {
    title: '.smtSubject input',
    descriptionFrame: 'iframe.cke_wysiwyg_frame',
    attributes: '.smtCustomAttrs input'
};

// --- 🎯 2. 真实接口地址 ---
window.API_CANDIDATES = [
    "/api/bannedWord/localBannedWordPageList.json",
    "/forbiddenWord/localBannedWordPageList.json",
    "/web/detection/bannedWord/localBannedWordPageList.json"
];

// --- 🏷️ UI 中文特征词配置映射表 (UI_TEXT_CONFIG) ---
// 将所有用于 DOM 匹配的硬编码中文集中管理，店小秘改版时只需改这里
window.UI_TEXT_CONFIG = {
    // --- 翻译相关 ---
    oneClickTranslate: '一键翻译',          // 一键翻译按钮文字
    translateChToEn: ['中文', '英文'],       // 翻译下拉菜单：中文 → 英文

    // --- 保存相关 ---
    saveToDraft: '保存并移入待发布',         // 保存按钮文字
    saveSuccess: ['操作成功', '保存成功'],   // 保存成功反馈文字
    saveFail: ['保存失败', '操作失败'],      // 保存失败反馈文字

    // --- 弹窗按钮 ---
    confirmBtn: ['确定', 'OK'],             // 确认弹窗按钮
    dismissBtn: '知道了',                   // 关闭提示弹窗
    skipEditProduct: ['跳过', '编辑产品'],  // 跳过分类编辑弹窗

    // --- 图片操作 ---
    editImage: '编辑图片',                  // 编辑图片下拉触发
    batchResizeImage: '批量改图片尺寸',     // 下拉菜单项
    selectAll: '选择全部',                  // 全选复选框
    generateJpg: '生成JPG图片',             // 生成按钮

    // --- 批量编辑表头 ---
    productTitle: '产品标题',               // 表头：产品标题列
    titleLabel: '标题:',                    // 单品页标题标签
    skuCode: '商品编码',                    // 表头：商品编码列
    customName: '自定义名称',               // 表头：自定义名称列
    selectGroup: '选择分组',                // 分组下拉占位符

    // --- 列表页/母舰 ---
    editLink: '编辑',                       // 编辑链接文字
    listPageAnchors: ['创建产品', '批量操作', '采集数据'], // 列表页锚点
};

// --- 📦 内存变量（运行时共享状态）---
window.whiteList = [];
window.forbiddenWords = [];
window.badImageCache = {};
window.autoBrands = [];
window.optimizationMode = 'normal';
