# 实验性 Fork：Folia AiRadio

本仓库是 Folia 0.7.7 的实验性分支，在桌面端接入节目口播（Radio Brief）。**未做全量回归**，不代表上游正式版。

上游：https://github.com/chthollyphile/folia-major  
本 fork：https://github.com/39Mikku/folia-major-AiRadio

## 功能

桌面端播放网易云歌曲时，可按当前队列现生成 80–150 字节目口播，压在 Folia 智能过渡的混音上开口。不另起播放器，不替你点歌或排歌单。

设置入口：播放控制 → 电台口播。需要文案模型密钥、Tavily 网搜密钥、MiniMax 语音密钥。纯音乐没有唱词也会继续用歌名和网搜写稿。

详细实现见 [电台口播](./radio-brief.md)。

## 实现要点

- 材料：歌词（在线统一入口）、网易云热评、Tavily 综合回答 + 三条正文。
- 文案：可编辑系统提示；JSON 输出格式由后台拼接。
- 音频：`musicDuck` 压乐，`voiceGain` 口播音量。
- 历史稿只留档，当次播放现生成。

## 未全量验证

- 未覆盖酷狗 / QQ 热评、Web 端、墙纸助手。
- 未做全量 UI / 多 provider 回归。
- 智能过渡、网易云登录、密钥缺失、纯音乐、开发者落盘只做过针对性检查。
- 安装包与上游同一版本号 0.7.7，用 NSIS 覆盖安装；不要删除 `%APPDATA%\Folia`。

把本 fork 当实验桌面包使用，发现问题请对照 `docs/radio-brief.md` 里的流水线逐步查。
