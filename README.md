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