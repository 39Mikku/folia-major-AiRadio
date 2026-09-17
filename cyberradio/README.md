# CyberRadio MCP

CyberRadio 是一个标准 **stdio MCP Server**。MCP 客户端通过 stdin/stdout 与它交换 JSON-RPC；播放器页面继续通过本机 HTTP/WebSocket 桥接接收播放、TTS、ducking 和 crossfade 指令。

## 启动

```powershell
npm install
npm start
```

启动后播放器位于 `http://127.0.0.1:5050`。端口优先读取 `PWA_PORT`，其次读取 `user-data/config.json` 的 `pwa.port`。

MCP 客户端配置示例（请把路径改成实际绝对路径）：

```json
{
  "mcpServers": {
    "cyber-radio": {
      "command": "node",
      "args": ["D:\\Python\\cyberradio\\mcp-server\\server.js"],
      "cwd": "D:\\Python\\cyberradio"
    }
  }
}
```

也可以在项目安装为 npm 包后使用 `cyber-radio-mcp` 命令。服务日志只写 stderr，不会污染 MCP 的 stdout 协议流。

## 可选环境变量

- `PWA_PORT=5050`：播放器 HTTP/WebSocket 端口。
- `CYBERRADIO_BRIDGE=0`：仅启动 stdio MCP，不启动播放器桥接；适合协议测试。默认开启，完整播放功能不变。

## 验证

```powershell
npm test
```

测试会用官方 MCP SDK 启动真实 stdio 子进程，验证初始化、32 个工具、工具调用，以及客户端关闭 stdin 后服务能正常退出。
