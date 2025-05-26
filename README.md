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

1. **纯文本格式**：
   - `https://域名/proxy-ips` - 纯文本显示代理IP
   - `https://域名/yx-ips` - 纯文本显示优选域名

2. **HTML页面格式**（如果需要）：
   - `https://域名/proxy-ips.html` - HTML页面显示代理IP
   - `https://域名/yx-ips.html` - HTML页面显示优选域名

输出格式示例：
```
IPv4
20.189.173.0 # 美国 华盛顿 西雅图, 45ms, Fast
34.102.136.180 # 美国 加利福尼亚 山景城, 67ms, Medium

IPv6
# 暂无IPv6数据
```