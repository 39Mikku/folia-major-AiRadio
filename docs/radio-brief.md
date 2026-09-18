# 电台口播（Radio Brief）

把 CyberRadio MCP 的节目口播闭环接到 Folia 桌面端：按当前播放队列现生成主持稿，压在 Folia 自己的混音上开口。不另起播放器，不点歌、不编排歌单。

本页属于实验性 fork，未全量验证。总述见 [FORK.md](./FORK.md)。

当前版本：覆盖安装到现有桌面 **0.7.7**（`appId` `top.izuna.foliamajor` 不变）。用户数据在 `%APPDATA%\Folia`，安装包默认不删。

## 用户怎么用

1. 桌面端。设置里填好文案模型密钥（与 AI 主题同一套）、Tavily 密钥、MiniMax 密钥。
2. 设置 → 播放控制 → 电台口播：打开口播；可选预生成、口播音量、压乐比例和时间。提示词可编辑，默认是技能原文；JSON 输出行由后台拼接，不出现在编辑框里。
3. 右侧控制面板有开关和「生成本首口播」。底部槽位也可挂电台口播。
4. 播一首网易云歌曲。口播等这首歌真正出声后再开始当次生成。
5. 提示走和 AI 主题一样的顶部胶囊。播完回到空闲。
6. 历史稿只留档，下次点到同一首歌仍现生成。按钮上的星标只表示有过留档，点「重新生成」也是再跑一轮。

开发者模式：每一步的仓鼠参数、材料、写稿请求体/回复、TTS 原文落到 `%APPDATA%\Folia\radio-brief-debug\<时间>_<歌曲键>\`。

## 当次生成流水线

对当前曲只跑一轮，预生成（若开启）在开口之后后台进行，不挡开口、不刷同一套提示。

1. 等音频通道（AudioContext / 口播增益节点）起来，最多 20 秒。
2. 歌词：在线统一入口 `omni.getLyrics`，滤掉作词作曲等署名行。纯音乐或无唱词不中断，材料里标明「本首是纯音乐」。
3. 热评：网易云 `/comment/hot`，清洗后最多 5 条；没有热评也不中断。
4. 网搜：Tavily Search，`search_depth: "basic"`（浅检索），`include_answer: "advanced"`（详细综合回答），`max_results: 3`。正文不截断。请求体只拼综合回答 + 标题 + 正文，不带网址。
5. 用 Folia 现有文案模型写 80–150 字 brief。系统提示来自 `cyberradio/SKILL.md` §1.1 / §5 / §6。
6. MiniMax 语音合成（`speech-2.8-hd`）。
7. 智能过渡仅在真正淡化（`fading`）时短等；预载下一首（`armed`）照样开口。开口对齐 `TrackProfile.sectionStart`（没有则 `leadIn` / 约 3 秒）。
8. 口播走独立 `voiceGain`，音乐走 `musicDuck`。默认音乐压到 10%，口播音量 100%，升降 600ms。

同一首暂停/继续不重跑。换歌或手动生成会 `force: true` 现生成。IndexedDB `radio_brief_<歌曲键>` 只做留档，不拿来播。

## 设置与密钥

| 项 | 位置 |
| --- | --- |
| 口播开关、预生成、预生成首数 | 本地 `localStorage` |
| 口播音量、压乐比例、压下/抬回时间 | 同上 |
| 开发者模式 | 同上 |
| Tavily / MiniMax 密钥与音色 | Electron `electron-store`（与 `GEMINI_API_KEY` 同一份） |

Tavily 相关度分数 `score` 目前不进模型。

## 关键文件

| 路径 | 职责 |
| --- | --- |
| `electron/radioBriefIpc.cjs` | 网搜、写稿、TTS、连通性探测、开发者落盘 |
| `src/services/radio/` | 材料、提示词、调度、混音、留档 |
| `src/hooks/useRadioBriefEngine.ts` | 播放状态接到调度器 |
| `src/services/playbackGraph.ts` | mix 后挂 `musicDuck`，音量前挂 `voiceGain` |
| `src/components/modal/settings/RadioBriefSettingsSection.tsx` | 设置页 |
| `src/components/panelTab/controls/RadioBriefActionRow.tsx` | 右侧面板开关 |

口播文案默认稿来自本地参考用的 CyberRadio 技能原文，该目录不进本仓库。

热评目前只有网易云 adapter 实现。酷狗/QQ 没有评论能力时该首不开口播。

## 覆盖安装

用同版本 NSIS 安装包覆盖当前主分支桌面版：`Folia-Setup-0.7.7.exe`。安装到已有目录即可。不要勾选卸载时删除用户数据。
