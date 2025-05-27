## Railway 部署步骤

1. **创建 Railway 项目**：
   - 访问 [railway.app](https://railway.app)
   - 连接你的 GitHub 仓库
   - 选择这个项目进行部署

2. **环境变量设置**：
   ```
   NODE_ENV=production
   PORT=3000
   ```

3. **部署配置**：
   Railway 会自动检测到 `package.json` 并运行 `npm start`

这个新版本的特点：

- ✅ 后台自动扫描，每6小时更新一次
- ✅ 使用真实的云服务商IP作为代理IP
- ✅ 显示延迟、网络速度、IP归属地
- ✅ 响应式设计，支持移动端
- ✅ 数据持久化存储
- ✅ 适合Railway平台部署

部署后，你的应用会自动开始扫描IP，并在前端显示结果。


## 文本格式端点：
- `GET /proxy-ips` - 纯文本显示代理IP
- `GET /yx-ips` - 纯文本显示优选IP（Cloudflare IP）

## HTML页面端点：
- `GET /proxy-ips.html` - HTML页面显示代理IP
- `GET /yx-ips.html` - HTML页面显示优选IP

## 额外的API端点：
- `GET /api/cloudflare-ips` - JSON格式的Cloudflare IP数据
- `GET /api/proxy-ips` - JSON格式的代理IP数据
- `GET /api/status` - 扫描状态
- `GET /api/stats` - 统计信息
- `POST /api/scan` - 手动触发扫描
- `GET /health` - 健康检查

访问地址：
- `https://你的域名/proxy-ips` 获取纯文本格式的代理IP
- `https://你的域名/yx-ips` 获取纯文本格式的优选IP
- `https://你的域名/proxy-ips.html` 获取HTML格式的代理IP页面
- `https://你的域名/yx-ips.html` 获取HTML格式的优选IP页面
