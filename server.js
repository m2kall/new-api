const express = require('express');
const path = require('path');
const { scanProxyIPs, scanCloudflareIPs } = require('./scanner');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// 安全设置
app.disable('x-powered-by');

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 存储扫描结果
let proxyResults = [];
let cloudflareResults = [];

// API 路由
app.get('/api/proxy-ips', (req, res) => {
  res.json({ success: true, data: proxyResults, lastUpdate: new Date().toISOString() });
});

app.get('/api/cloudflare-ips', (req, res) => {
  res.json({ success: true, data: cloudflareResults, lastUpdate: new Date().toISOString() });
});

app.post('/api/scan/proxy', async (req, res) => {
  try {
    console.log('开始扫描代理IP...');
    proxyResults = await scanProxyIPs();
    res.json({ success: true, message: '代理IP扫描完成', count: proxyResults.length });
  } catch (error) {
    res.status(500).json({ success: false, message: '扫描失败: ' + error.message });
  }
});

app.post('/api/scan/cloudflare', async (req, res) => {
  try {
    console.log('开始扫描Cloudflare IP...');
    cloudflareResults = await scanCloudflareIPs();
    res.json({ success: true, message: 'Cloudflare IP扫描完成', count: cloudflareResults.length });
  } catch (error) {
    res.status(500).json({ success: false, message: '扫描失败: ' + error.message });
  }
});

// SPA 兜底或首页
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 定时任务
async function startPeriodicScanning() {
  // 每小时扫描一次代理IP
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('定时扫描代理IP...');
      proxyResults = await scanProxyIPs();
      console.log(`代理IP扫描完成，找到 ${proxyResults.length} 个IP`);
    } catch (error) {
      console.error('代理IP扫描失败:', error.message);
    }
  });

  // 每2小时扫描一次Cloudflare IP
  cron.schedule('0 */2 * * *', async () => {
    try {
      console.log('定时扫描Cloudflare IP...');
      cloudflareResults = await scanCloudflareIPs();
      console.log(`Cloudflare IP扫描完成，找到 ${cloudflareResults.length} 个IP`);
    } catch (error) {
      console.error('Cloudflare IP扫描失败:', error.message);
    }
  });

  // 启动时执行一次扫描
  try {
    console.log('初始化扫描...');
    proxyResults = await scanProxyIPs();
    cloudflareResults = await scanCloudflareIPs();
    console.log('初始化扫描完成');
  } catch (error) {
    console.error('初始化扫描失败:', error.message);
  }
}

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  startPeriodicScanning();
});