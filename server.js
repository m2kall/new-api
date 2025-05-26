const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const IPScanner = require('./services/scanner');
const { getAllIPs } = require('./services/ipSources');

const app = express();
const PORT = process.env.PORT || 3000;

// ==============================
// 中间件
// ==============================
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==============================
// 初始化扫描器
// ==============================
const scanner = new IPScanner();
scanner.loadResults(); // 启动时加载之前的结果

// ==============================
// API 路由
// ==============================
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

// 手动触发扫描
app.post('/api/scan', async (req, res) => {
  if (scanner.getScanStatus().isScanning) {
    return res.json({
      success: false,
      message: 'Scan already in progress'
    });
  }

  const ipSources = getAllIPs();
  scanner.performScan(ipSources);

  res.json({
    success: true,
    message: 'Scan started'
  });
});

// ==============================
// 页面路由
// ==============================

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 代理IP文本页面
app.get('/proxy-ips', async (req, res) => {
  const results = scanner.getResults();
  let output = '';

  // IPv4
  if (results.proxyIPs.ipv4 && results.proxyIPs.ipv4.length > 0) {
    output += 'IPv4\n';
    results.proxyIPs.ipv4.forEach(ip => {
      const location = `${ip.location.country} ${ip.location.region} ${ip.location.city}`;
      output += `${ip.ip} # ${location}, ${ip.latency}ms, ${ip.speed}\n`;
    });
  }

  output += '\n';

  // IPv6
  if (results.proxyIPs.ipv6 && results.proxyIPs.ipv6.length > 0) {
    output += 'IPv6\n';
    results.proxyIPs.ipv6.forEach(ip => {
      const location = `${ip.location.country} ${ip.location.region} ${ip.location.city}`;
      output += `${ip.ip} # ${location}, ${ip.latency}ms, ${ip.speed}\n`;
    });
  } else {
    output += 'IPv6\n# 暂无IPv6数据\n';
  }

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(output);
});

// 优选域名文本页面
app.get('/yx-ips', async (req, res) => {
  const results = scanner.getResults();
  let output = '';

  // IPv4
  if (results.domains && results.domains.length > 0) {
    output += 'IPv4\n';
    results.domains.forEach(domain => {
      output += `${domain.domain} # 优选域名, ${domain.latency}ms, ${domain.speed}\n`;
    });
  }

  output += '\n';

  // IPv6（暂无）
  output += 'IPv6\n# 暂无IPv6数据\n';

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(output);
});

// HTML 页面
app.get('/proxy-ips.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'proxy-ips.html'));
});

app.get('/yx-ips.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'yx-ips.html'));
});

// ==============================
// 定时任务
// ==============================

// 每 6 小时执行一次扫描
cron.schedule('0 */6 * * *', async () => {
  console.log('Starting scheduled scan...');
  const ipSources = getAllIPs();
  await scanner.performScan(ipSources);
});

// 启动时延迟 5 秒执行一次扫描
setTimeout(async () => {
  console.log('Performing initial scan...');
  const ipSources = getAllIPs();
  await scanner.performScan(ipSources);
}, 5000);

// ==============================
// 启动服务
// ==============================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});