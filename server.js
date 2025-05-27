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

// API路由 - 优选IP（Cloudflare）
app.get('/api/cloudflare-ips', (req, res) => {
  const results = scanner.getResults();
  res.json({
    success: true,
    data: results.cloudflare,
    lastUpdate: results.lastUpdate
  });
});

// API路由 - 代理IP（非Cloudflare）
app.get('/api/proxy-ips', (req, res) => {
  const results = scanner.getResults();
  res.json({
    success: true,
    data: results.proxyIPs,
    lastUpdate: results.lastUpdate
  });
});

// API路由 - 获取状态
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

// 纯文本页面 - 代理IP
app.get('/proxy-ips', async (req, res) => {
  const results = scanner.getResults();
  let output = '';
  
  // IPv4 部分
  output += 'IPv4\n';
  if (results.proxyIPs && results.proxyIPs.length > 0) {
    results.proxyIPs.forEach(ip => {
      const location = `${ip.location.country} ${ip.location.region} ${ip.location.city}`;
      output += `${ip.ip} # ${location}, ${ip.latency}ms, ${ip.speed}\n`;
    });
  } else {
    output += '# 暂无数据\n';
  }
  
  output += '\nIPv6\n# 暂无IPv6数据\n';
  
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(output);
});

// 纯文本页面 - 优选IP
app.get('/yx-ips', async (req, res) => {
  const results = scanner.getResults();
  let output = '';
  
  // IPv4 部分
  output += 'IPv4\n';
  if (results.cloudflare && results.cloudflare.length > 0) {
    results.cloudflare.forEach(item => {
      const location = `${item.location.country} ${item.location.region} ${item.location.city}`;
      output += `${item.ip} # ${location}, ${item.latency}ms, ${item.speed}\n`;
    });
  } else {
    output += '# 暂无数据\n';
  }
  
  output += '\nIPv6\n# 暂无IPv6数据\n';
  
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(output);
});

// HTML页面路由
app.get('/proxy-ips.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'proxy-ips.html'));
});

app.get('/yx-ips.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'yx-ips.html'));
});

// 首页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Page not found'
  });
});

// 错误处理
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 定时任务 - 每6小时扫描一次
cron.schedule('0 */6 * * *', async () => {
  console.log('Starting scheduled scan...');
  try {
    const ipSources = getAllIPs();
    await scanner.performScan(ipSources);
  } catch (error) {
    console.error('Scheduled scan failed:', error);
  }
});

// 启动时立即执行一次扫描
setTimeout(async () => {
  console.log('Performing initial scan in 10 seconds...');
  try {
    const ipSources = getAllIPs();
    await scanner.performScan(ipSources);
  } catch (error) {
    console.error('Initial scan failed:', error);
  }
}, 10000); // 延迟10秒启动，确保服务完全启动

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Available endpoints:');
  console.log(`  - Main page: http://localhost:${PORT}/`);
  console.log(`  - Proxy IPs (text): http://localhost:${PORT}/proxy-ips`);
  console.log(`  - Cloudflare IPs (text): http://localhost:${PORT}/yx-ips`);
  console.log(`  - API Status: http://localhost:${PORT}/api/status`);
});