## README.md
```markdown
# IP扫描器 - 代理IP & Cloudflare优选IP

一个基于 Node.js 的网页应用程序，用于自动扫描美国代理IP和Cloudflare优选IP地址。

## 功能特性

- 🔍 **自动扫描美国代理IP** - 从多个数据源获取并验证美国地区的代理服务器
- ⚡ **Cloudflare优选IP扫描** - 测试Cloudflare IP段，找出延迟最低的优选IP
- 🌐 **双协议支持** - 同时支持IPv4和IPv6地址
- 📊 **实时统计** - 显示扫描结果的详细统计信息
- ⏰ **定时扫描** - 自动定时更新IP列表
- 📱 **响应式设计** - 支持桌面和移动设备

## 部署到 Lade.io

### 1. 准备项目文件

确保你的项目包含以下文件：
- `package.json`
- `server.js`
- `scanner.js`
- `public/index.html`

### 2. 安装 Lade CLI

```bash
npm install -g @lade/cli
```

### 3. 登录 Lade

```bash
lade login
```

### 4. 初始化项目

```bash
lade init
```

### 5. 部署应用

```bash
lade deploy
```

## 本地开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 启动生产服务器

```bash
npm start
```

应用将在 `http://localhost:3000` 上运行。

## API 接口

### 获取代理IP列表
```
GET /api/proxy-ips
```

### 获取Cloudflare IP列表
```
GET /api/cloudflare-ips
```

### 手动触发代理IP扫描
```
POST /api/scan/proxy
```

### 手动触发Cloudflare IP扫描
```
POST /api/scan/cloudflare
```

## 配置说明

### 环境变量

- `PORT` - 服务器端口（默认: 3000）

### 扫描设置

- 代理IP扫描：每小时执行一次
- Cloudflare IP扫描：每2小时执行一次
- 延迟阈值：200ms（Cloudflare优选IP）

## 数据格式

### 代理IP格式
```
IPv4 #地区名称
IPv6 #地区名称
```

### Cloudflare优选IP格式
```
IPv4 #优选地区
IPv6 #优选地区
```

### 实际访问示例
如果你的应用部署在Lade.io上，访问路径会是：

```bash
https://your-app-name.lade.io/                    # 主页面
https://your-app-name.lade.io/api/proxy-ips       # 代理IP数据
https://your-app-name.lade.io/api/cloudflare-ips  # Cloudflare IP数据
```

### 使用方式
1. 查看扫描结果: 直接访问主页 /
2. 获取JSON数据: 访问对应的API接口
3. 手动扫描: 在主页点击扫描按钮，或者直接POST到扫描接口

## 技术栈

- **后端**: Node.js + Express
- **前端**: HTML5 + CSS3 + JavaScript
- **依赖包**:
  - `express` - Web框架
  - `axios` - HTTP客户端
  - `ping` - 网络延迟测试
  - `node-cron` - 定时任务

## 注意事项

1. **IP过滤**: 自动排除Cloudflare IP地址，避免在代理IP扫描中包含CF节点
2. **延迟优化**: Cloudflare IP按延迟排序，优先显示响应最快的IP
3. **数据限制**: 为避免过载，限制了扫描结果的数量
4. **错误处理**: 包含完善的错误处理和用户反馈机制

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 支持

如果你觉得这个项目有用，请给它一个 ⭐️！
```

这个完整的项目包含了：

1. **完整的Node.js后端** - 包含扫描逻辑和API接口
2. **现代化的前端界面** - 响应式设计，美观易用
3. **自动扫描功能** - 定时扫描和手动触发
4. **IP验证和过滤** - 确保代理IP不包含Cloudflare地址
5. **详细的README** - 包含部署和使用说明

你可以直接使用这些代码创建项目，然后按照README中的说明部署到Lade.io平台。