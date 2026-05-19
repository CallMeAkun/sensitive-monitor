# HTML 敏感信息稳定监控

一个 Chrome / Chromium Manifest V3 浏览器扩展，用于在页面中扫描敏感关键字或正则规则，并在扩展图标角标和弹出面板中展示命中结果。

## 功能

- 扫描当前页面 HTML 标签、属性和直接文本内容。
- 支持自定义敏感关键字。
- 支持普通字符串和正则表达式两种规则。
- 关键字配置保存在浏览器本地 `chrome.storage.local`。
- 页面内容发生动态变化时自动重新扫描，适配常见 SPA 页面。
- 命中后扩展图标显示命中标签数量。
- 弹出面板按命中的 DOM 标签逐条列出结果。
- 点击命中列表项后，页面会自动滚动到对应标签并高亮显示。

## 文件说明

```text
.
├── manifest.json      扩展清单文件，声明权限、后台脚本、弹窗页面和 content script
├── background.js      后台 service worker，负责保存各标签页命中状态和更新扩展角标
├── content.js         注入到网页中的扫描脚本，负责扫描 DOM、监听变化、定位并高亮命中元素
├── popup.html         扩展弹出面板的页面结构和样式
├── popup.js           弹出面板逻辑，负责保存关键字、刷新结果、点击定位命中元素
├── icons/             扩展图标资源
└── .gitignore         Git 忽略规则
```

## 安装和加载

1. 打开浏览器扩展管理页面：

   ```text
   chrome://extensions/
   ```

2. 打开右上角的“开发者模式”。

3. 点击“加载已解压的扩展程序”。

4. 选择当前项目目录：

   ```text
   sensitive-monitor
   ```

5. 加载成功后，浏览器工具栏会出现扩展图标。

## 使用方式

1. 打开需要扫描的网页。

2. 点击扩展图标，打开弹出面板。

3. 在文本框中输入规则，一行一个。

   普通关键字示例：

   ```text
   password
   maxlength
   token
   ```

   正则表达式示例：

   ```text
   /^1[3-9]\d{9}$/
   /access[_-]?token/i
   ```

4. 点击“保存关键字”。

5. 扩展会重新扫描当前页面。

6. 如果页面存在命中标签，弹出面板会按标签逐条列出。

7. 点击某一条命中结果，页面会自动滚动到对应 DOM 标签并高亮显示。

## 命中结果说明

弹出面板中的每条结果包含：

- 标签名，例如 `input`、`div`、`script`。
- 简短标签标识，例如 `input#password.login-input`。
- 命中的规则。
- 命中上下文片段。

扩展图标角标显示的是命中的标签数量，不是关键字数量。

## 注意事项

- 浏览器内置页面无法被扩展注入，例如 `chrome://extensions/`、Chrome Web Store 等页面。
- 如果需要扫描本地 `file://` 页面，需要在扩展详情页中开启“允许访问文件网址”。
- 普通扩展不能直接打开或控制 DevTools 的 Elements 面板，因此点击命中项目前采用“滚动到元素并高亮”的方式辅助定位。
- 正则规则需要使用 `/pattern/` 格式输入。当前保存时会取首尾 `/` 之间的内容作为正则主体。

## 开发验证

可以使用 Node.js 对 JavaScript 文件做基础语法检查：

```powershell
node --check background.js
node --check content.js
node --check popup.js
```

也可以检查 `manifest.json` 是否是合法 JSON：

```powershell
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```
