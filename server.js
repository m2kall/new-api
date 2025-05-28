const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const IPScanner = require('./services/scanner');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const scanner = new IPScanner();

(async () => {
  await scanner.initIpRanges();
  // 启动时加载之前的结果
  await scanner.loadResults(); // IPScanner 内部会处理文件不存在的情况

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

    // 从请求体获取扫描参数
    const scanOptions = {
      cloudflareScanCount: req.body.cloudflareCount || 30,
      proxyScanCount: req.body.proxyCount || 50,
      ipsPerRange: req.body.ipsPerRange || 2,
      scanDelay: req.body.delay || 150
    };
    
    console.log('Manual scan triggered with options:', scanOptions);
    
    // 异步执行扫描
    scanner.performScan(scanOptions).catch(error => {
      console.error('Manual scan failed:', error);
    });

    res.json({
      success: true,
      message: 'Scan started'
    });
  });

  // 纯文本页面 - 代理IP (按README.md规范)
  app.get('/proxy-ips', async (req, res) => {
    const results = scanner.getResults();
    let output = '';
    
    if (results.proxyIPs && results.proxyIPs.length > 0) {
      results.proxyIPs.forEach(ip => {
        const locationInfo = ip.location ? 
          `${ip.location.country || ''} ${ip.location.region || ''} ${ip.location.city || ''}`.trim() : 
          'Unknown Location';
        const ispInfo = ip.location && ip.location.isp ? `, ${ip.location.isp}` : '';
        const typeInfo = ip.type ? ` (${ip.type})` : '';
        output += `${ip.ip} # ${locationInfo}${ispInfo}${typeInfo}, Latency: ${ip.latency}ms, HTTP Response: ${ip.responseTime}ms, Speed: ${ip.speed}, HTTP Status: ${ip.httpStatus || 'N/A'}\n`;
      });
    } else {
      output += '# 暂无数据，请等待扫描完成\n';
      output += '# 扫描状态: ' + (scanner.getScanStatus().isScanning ? '扫描中...' : '空闲') + '\n';
    }
    
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(output);
  });

  // 纯文本页面 - 优选IP (按README.md规范)
  app.get('/yx-ips', async (req, res) => {
    const results = scanner.getResults();
    let output = '';
    
    if (results.cloudflare && results.cloudflare.length > 0) {
      results.cloudflare.forEach(item => {
        const locationInfo = item.location ? 
          `${item.location.country || ''} ${item.location.region || ''} ${item.location.city || ''}`.trim() : 
          'Unknown Location';
        const ispInfo = item.location && item.location.isp ? `, ${item.location.isp}` : '';
        const typeInfo = item.type ? ` (${item.type})` : '';
        output += `${item.ip} # ${locationInfo}${ispInfo}${typeInfo}, Latency: ${item.latency}ms, HTTP Response: ${item.responseTime}ms, Speed: ${item.speed}, HTTP Status: ${item.httpStatus || 'N/A'}\n`;
      });
    } else {
      output += '# 暂无数据，请等待扫描完成\n';
      output += '# 扫描状态: ' + (scanner.getScanStatus().isScanning ? '扫描中...' : '空闲') + '\n';
    }
    
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(output);
  });

  // HTML页面路由 (按README.md规范)
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

  // 健康检查端点
  app.get('/health', (req, res) => {
    const status = scanner.getScanStatus();
    res.json({
      success: true,
      status: 'healthy',
      scanning: status.isScanning,
      lastUpdate: status.lastUpdate,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  });

  // 获取扫描统计信息
  app.get('/api/stats', (req, res) => {
    const results = scanner.getResults();
    res.json({
      success: true,
      stats: {
        cloudflareCount: results.cloudflare.length,
        proxyCount: results.proxyIPs.length,
        lastUpdate: results.lastUpdate,
        isScanning: scanner.getScanStatus().isScanning
      }
    });
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
    cloudflareScanCount: 80,
    proxyScanCount: 120,
    ipsPerRange: 4,
    scanDelay: 80
  };

  cron.schedule('0 */6 * * *', async () => {
    console.log('Starting scheduled scan with options:', scheduledScanOptions);
    try {
      await scanner.performScan(scheduledScanOptions);
      console.log('Scheduled scan completed successfully');
    } catch (error) {
      console.error('Scheduled scan failed:', error);
    }
  });

  // 每天凌晨2点执行深度扫描
  const deepScanOptions = {
    cloudflareScanCount: 150,
    proxyScanCount: 200,
    ipsPerRange: 6,
    scanDelay: 60
  };

  cron.schedule('0 2 * * *', async () => {
    console.log('Starting daily deep scan with options:', deepScanOptions);
    try {
      await scanner.performScan(deepScanOptions);
      console.log('Daily deep scan completed successfully');
    } catch (error) {
      console.error('Daily deep scan failed:', error);
    }
  });

  // 启动时延迟执行初始扫描
  const initialScanOptions = {
    cloudflareScanCount: 30,
    proxyScanCount: 50,
    ipsPerRange: 2,
    scanDelay: 150
  };

  setTimeout(async () => {
    console.log('Performing initial scan in 10 seconds with options:', initialScanOptions);
    try {
      await scanner.performScan(initialScanOptions);
      console.log('Initial scan completed successfully');
    } catch (error) {
      console.error('Initial scan failed:', error);
    }
  }, 10000);

  // 优雅关闭处理
  const gracefulShutdown = async (signal) => {
    console.log(`${signal} received, shutting down gracefully`);
    
    try {
      // 保存当前扫描结果
      await scanner.saveResults();
      console.log('Results saved successfully');
    } catch (error) {
      console.error('Error saving results during shutdown:', error);
    }
    
    // 关闭服务器
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // 未捕获异常处理
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
  });

  // 启动服务器
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
})();