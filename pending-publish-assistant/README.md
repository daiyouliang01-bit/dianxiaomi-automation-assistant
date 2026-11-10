# 店小秘自动化工具 V2 待发布专用版

这是面向店小秘速卖通“待发布”列表的 Chrome 插件版本，只保留待发布自动编辑与发布流程，以及该流程依赖的基础优化能力。

## 保留功能

- 待发布列表自动发布入口，仅在 `/web/smt/smtProductList/offline` 页面显示。
- 最多同时打开 5 个后台商品编辑页，并由后台主动唤醒各页开始自动化。
- 单个商品完成并关闭后，后台自动补开下一条待发布数据。
- 中文翻译英文、一键优化、800 图片处理、安全检测、违禁词清理。
- 汽摩配模式、自定义品牌词库、SKU/属性优化规则。
- PC 描述模板、模板图片、引用产品图片、无线端新版编辑器生成与保存、立即发布。
- Gemini / 千问 API Key 配置与店小秘违禁词同步。

## 已移除

- 采集箱 RPA 入口、采集箱队列、采集箱子页自动化。
- 图片空间清理队列和 RPA 运行状态统计。
- 与 `rpa_auto`、`rpa_running`、`open_rpa_tabs` 相关的后台和页面逻辑。

## 使用方式

1. 在 Chrome 扩展程序页面加载本目录。
2. 进入店小秘速卖通待发布列表 `/web/smt/smtProductList/offline`。
3. 勾选要处理的数据，点击“启动自动发布”。
4. 插件会最多并行打开 5 个后台编辑页；每个页面完成后会自动关闭并补开下一条。

## 验证

```bash
node --check src/background/background.js
node --check src/content/main.js
node --check src/workflows/auto-publish.js
node --check src/platform/inject-open-hook.js
node --test tests/*.test.js
```
