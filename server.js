const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const IPScanner = require('./services/scanner');
const { getAllIPs } = require('./services/ipSources');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 初始化扫描器
const scanner = new IPScanner();

// 启动时加载之前的结果
scanner.loadResults();

// API路由
app.get('/api/cloudflare-ips', (req, res) => {
  const results = scanner.getResults();
  res.json({
    success: true,
    data: results.cloudflare,
    lastUpdate: results.lastUpdate
  });
});

app.get('/api/proxy-ips', (req, res) => {
  const results = scanner.getResults();
  res.json({
    success: true,
    data: results.proxyIPs,
    lastUpdate: results.lastUpdate
  });
});

app.get('/api/domains', (req, res) => {
  const results = scanner.getResults();
  res.json({
    success: true,
    data: results.domains,
    lastUpdate: results.lastUpdate
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: scanner.getScanStatus()
  });
});

// 手动触发扫描（用于测试）
app.post('/api/scan', async (req, res) => {
  if (scanner.getScanStatus().isScanning) {
    return res.json({
      success: false,
      message: 'Scan already in progress'
    });
  }

  // 异步执行扫描
  const ipSources = getAllIPs();
  scanner.performScan(ipSources);

  res.json({
    success: true,
    message: 'Scan started'
  });
});

// 首页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 定时任务 - 每6小时扫描一次
cron.schedule('0 */6 * * *', async () => {
  console.log('Starting scheduled scan...');
  const ipSources = getAllIPs();
  await scanner.performScan(ipSources);
});

// 启动时执行一次扫描
setTimeout(async () => {
  console.log('Performing initial scan...');
  const ipSources = getAllIPs();
  await scanner.performScan(ipSources);
}, 5000); // 延迟5秒启动

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});