const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
// 确保这里的路径指向你更新后的 IPScanner 类文件
const IPScanner = require('./services/scanner.js'); 

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 初始化扫描器
const scanner = new IPScanner();

// 启动时加载之前的结果
scanner.loadResults(); // IPScanner 内部会处理文件不存在的情况

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
  // 可以根据需要从 req.body 或其他配置源获取扫描参数
  const scanOptions = {
    cloudflareScanCount: req.body.cloudflareCount || 15, // 从请求体获取或使用默认值
    proxyScanCount: req.body.proxyCount || 20,
    ipsPerCidrForCloudflare: req.body.ipsPerCfCidr || 1,
    ipsPerCidrForProxy: req.body.ipsPerProxyCidr || 1,
    scanDelay: req.body.delay || 75
  };
  console.log('Manual scan triggered with options:', scanOptions);
  scanner.performScan(scanOptions); // 异步执行，不需要 await，因为我们希望立即响应

  res.json({
    success: true,
    message: 'Scan started'
  });
});

// 纯文本页面 - 代理IP
app.get('/proxy-ips', async (req, res) => {
  const results = scanner.getResults();
  let output = '';
  
  if (results.proxyIPs && results.proxyIPs.length > 0) {
    results.proxyIPs.forEach(ip => {
      // 新的 IPScanner 结果可能包含更详细的 location 和 type
      const locationInfo = ip.location ? `${ip.location.country || ''} ${ip.location.region || ''} ${ip.location.city || ''}`.trim() : 'Unknown Location';
      const ispInfo = ip.location && ip.location.isp ? `, ${ip.location.isp}` : '';
      const typeInfo = ip.type ? ` (${ip.type})` : ''; // 显示 IP 来源类型
      output += `${ip.ip} # ${locationInfo}${ispInfo}${typeInfo}, Latency: ${ip.latency}ms, HTTP Response: ${ip.responseTime}ms, Speed: ${ip.speed}, HTTP Status: ${ip.httpStatus || 'N/A'}\n`;
    });
  } else {
    output += '# 暂无数据\n';
  }
  
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(output);
});

// 纯文本页面 - 优选IP
app.get('/yx-ips', async (req, res) => {
  const results = scanner.getResults();
  let output = '';
  
  if (results.cloudflare && results.cloudflare.length > 0) {
    results.cloudflare.forEach(item => {
      const locationInfo = item.location ? `${item.location.country || ''} ${item.location.region || ''} ${item.location.city || ''}`.trim() : 'Unknown Location';
      const ispInfo = item.location && item.location.isp ? `, ${item.location.isp}` : '';
      const typeInfo = item.type ? ` (${item.type})` : '';
      output += `${item.ip} # ${locationInfo}${ispInfo}${typeInfo}, Latency: ${item.latency}ms, HTTP Response: ${item.responseTime}ms, Speed: ${item.speed}, HTTP Status: ${item.httpStatus || 'N/A'}\n`;
    });
  } else {
    output += '# 暂无数据\n';
  }
  
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
const scheduledScanOptions = {
  cloudflareScanCount: 25, // 定时任务可以扫描更多
  proxyScanCount: 40,
  ipsPerCidrForCloudflare: 2,
  ipsPerCidrForProxy: 1,
  scanDelay: 50
};
cron.schedule('0 */6 * * *', async () => {
  console.log('Starting scheduled scan with options:', scheduledScanOptions);
  try {
    await scanner.performScan(scheduledScanOptions);
  } catch (error) {
    console.error('Scheduled scan failed:', error);
  }
});

// 启动时立即执行一次扫描，但延迟5秒
const initialScanOptions = {
  cloudflareScanCount: 15,
  proxyScanCount: 20,
  ipsPerCidrForCloudflare: 1,
  ipsPerCidrForProxy: 1,
  scanDelay: 100
};
setTimeout(async () => {
  console.log('Performing initial scan in 5 seconds with options:', initialScanOptions);
  try {
    await scanner.performScan(initialScanOptions);
  } catch (error) {
    console.error('Initial scan failed:', error);
  }
}, 5000);

// 移除了外部的测试数据添加逻辑，因为 IPScanner 内部有 addFallbackDataIfNeeded
/*
setTimeout(() => {
  if (scanner.results.cloudflare.length === 0 && scanner.results.proxyIPs.length === 0) {
    console.log('Adding test data...');
    // ... (如果需要，确保这里的测试数据结构与新 IPScanner 输出一致)
    // scanner.saveResults();
  }
}, 60000); 
*/

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  // 在这里可以添加保存当前状态等逻辑
  scanner.saveResults().finally(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  // 在这里可以添加保存当前状态等逻辑
  scanner.saveResults().finally(() => process.exit(0));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Available endpoints:');
  console.log(`  - Main page: http://localhost:${PORT}/`);
  console.log(`  - Proxy IPs (text): http://localhost:${PORT}/proxy-ips`);
  console.log(`  - Cloudflare IPs (text): http://localhost:${PORT}/yx-ips`);
  console.log(`  - API Status: http://localhost:${PORT}/api/status`);
  console.log(`  - Manual Scan (POST): http://localhost:${PORT}/api/scan`);
});