# 月历

按月显示的日历网页 App（PWA）。每天可以添加带颜色优先级的事件，完成后显示为淡色加删除线；上下滑动切换月份，始终保持 6 行；支持浅色 / 深色模式、多设备同步，以及 iOS / 安卓桌面小组件。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` `styles.css` `app.js` | App 本体 |
| `manifest.webmanifest` `sw.js` `icons/` | 让它能“添加到主屏幕”并离线打开 |
| `widget-ios-scriptable.js` | iOS 小组件脚本（在 Scriptable 里运行） |
| `widget.html` | 安卓小组件用的网页 |

## 一、部署到 GitHub Pages

1. 在 GitHub 新建一个仓库（例如 `month-calendar`），把本文件夹里的**所有文件**上传到仓库根目录。
2. 仓库 → Settings → Pages → Source 选 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`，保存。
3. 一两分钟后访问 `https://你的用户名.github.io/month-calendar/`。
4. 添加到主屏幕：
   - **iPhone**：用 Safari 打开 → 分享 → 添加到主屏幕。
   - **安卓**：用 Chrome 打开 → 菜单 → 安装应用 / 添加到主屏幕。

以后修改了文件，把 `sw.js` 第一行的 `mcal-v1` 改成 `mcal-v2`（依次递增），手机上重新打开两次就会更新。

## 二、多设备同步（用密钥）

同步靠 GitHub 的个人访问令牌（就是“密钥”）。数据存在你账号下的一个私密 Gist 里，按事件逐条合并：两台设备分别改了不同的事件都会保留；同一个事件两边都改了，以最后修改的为准；删除也会同步。

**创建令牌（只需一次）**

- 方式 A（推荐）：GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token → Account permissions 里把 **Gists** 设为 **Read and write**，其余不用勾。
- 方式 B：**Tokens (classic)** → 只勾选 `gist`。

有效期按自己习惯设，过期后 App 会提示“令牌无效或已过期”，换一个新的即可。

**每台设备上**：打开 App → 右上角 ⋯ → 在「GitHub 令牌」里粘贴同一个令牌 → 点「立即同步」。第一台设备会自动创建 Gist，之后的设备会用令牌自动找到它，Gist ID 一般不用填。

App 每次打开、切回前台、修改后 1.5 秒、以及每 3 分钟都会自动同步。离线时照常使用，联网后自动补上。

> 私密 Gist 不会被搜索到，但知道 Gist ID 的人可以读取内容。不要公开小组件链接或 Gist ID；令牌也不要发给别人。

## 三、iOS 桌面小组件

网页 App 本身无法在 iOS 上创建桌面小组件，所以借助免费的 **Scriptable** App 来显示。

1. App Store 安装 **Scriptable**。
2. 在月历 App 里完成一次同步，然后 ⋯ → 「复制 iOS 小组件脚本」（脚本里已自动填好你的 Gist ID 和网址）。
3. 打开 Scriptable → 右上角 + → 粘贴 → 点标题改名为「月历」→ Done。可以先点 ▶ 预览大 / 中 / 小三种尺寸。
4. 回到桌面长按空白处 → 左上角 + → 选 Scriptable → 选**大号**（整月日历）或中号 / 小号 → 添加。
5. 长按这个小组件 → 编辑小组件 → Script 选「月历」。
   - 想点小组件直接打开月历：把 When Interacting 设为 **Open URL**，填你的 App 网址。
   - Parameter 可以留空；填 `dark` 或 `light` 可固定深浅色（默认跟随系统）。

尺寸说明：大号显示整月 6 行，每天显示彩色事件条，已完成的为淡色；中号是迷你月历（彩色小圆点）+ 今天和接下来的事件；小号是今天的事件。

刷新频率由 iOS 决定，通常 15–30 分钟一次，所以在 App 里改完不会立刻出现在小组件上。

## 四、安卓桌面小组件

安卓的 Chrome 目前不支持网页 App 的桌面小组件，需要一个能把网页放到桌面的小组件 App：

1. 在 Play 商店搜索 “web widget” 或“网页小组件”，安装一个支持运行 JavaScript 的。
2. 在月历 App 里 ⋯ → 「复制安卓小组件链接」，粘贴到该小组件 App 里。
3. 链接末尾加 `&theme=dark` 或 `&theme=light` 可固定深浅色，不加则跟随系统。

## 五、备份

⋯ → 「导出备份」得到一个 JSON 文件；「导入备份」会与现有数据合并，不会覆盖。
