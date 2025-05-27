const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class IPScanner {
  constructor() {
    this.results = {
      cloudflare: [],
      proxyIPs: [],
      lastUpdate: new Date().toISOString()
    };
    this.isScanning = false;

    // 基于 XIU2/CloudflareSpeedTest 的 Cloudflare IP 段
    this.cloudflareCIDRs = [
      '173.245.48.0/20',
      '103.21.244.0/22',
      '103.22.200.0/22',
      '103.31.4.0/22',
      '141.101.64.0/18',
      '108.162.192.0/18',
      '190.93.240.0/20',
      '188.114.96.0/20',
      '197.234.240.0/22',
      '198.41.128.0/17',
      '162.158.0.0/15',
      '104.16.0.0/13',
      '104.24.0.0/14',
      '172.64.0.0/13',
      '131.0.72.0/22'
    ];

    // 美国主要云服务商IP段
    this.proxyCIDRs = [
      // Google Cloud US
      '34.64.0.0/10',
      '35.184.0.0/13',
      '104.196.0.0/14',
      // AWS US
      '52.0.0.0/11',
      '54.64.0.0/11',
      '3.208.0.0/12',
      // Azure US
      '20.36.0.0/13',
      '40.64.0.0/10',
      '52.224.0.0/11',
      // DigitalOcean
      '134.209.0.0/16',
      '159.203.0.0/16',
      '68.183.0.0/16'
    ];
  }

  // 基于 XIU2 方法：从 CIDR 生成随机 IP
  generateIPsFromCIDR(cidr, count = 10) {
    const [network, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength);
    const hostBits = 32 - prefix;
    const maxHosts = Math.pow(2, hostBits) - 2; // 减去网络地址和广播地址
    
    const networkParts = network.split('.').map(Number);
    const ips = new Set();
    
    for (let i = 0; i < count * 3 && ips.size < count; i++) {
      // 生成随机主机号（避开网络地址和广播地址）
      const hostNum = Math.floor(Math.random() * maxHosts) + 1;
      
      // 计算IP地址
      let ip = [...networkParts];
      let remaining = hostNum;
      
      for (let j = 3; j >= 0; j--) {
        const byteBits = Math.min(8, Math.max(0, hostBits - (3 - j) * 8));
        if (byteBits > 0) {
          const byteMax = Math.pow(2, byteBits) - 1;
          const byteValue = remaining & byteMax;
          ip[j] = (ip[j] & (255 - byteMax)) | byteValue;
          remaining = remaining >> byteBits;
        }
      }
      
      ips.add(ip.join('.'));
    }
    
    return Array.from(ips);
  }

  // 基于 XIU2 方法：下载测试
  async downloadSpeedTest(ip, testUrl = '/cdn-cgi/trace') {
    try {
      const startTime = Date.now();
      const response = await axios.get(`http://${ip}${testUrl}`, {
        timeout: 10000,
        responseType: 'text',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const dataSize = response.data.length;
      const speed = dataSize / (duration / 1000); // bytes per second
      
      return {
        success: true,
        latency: duration,
        speed: speed,
        dataSize: dataSize,
        httpStatus: response.status
      };
    } catch (error) {
      return {
        success: false,
        latency: 9999,
        speed: 0,
        error: error.message
      };
    }
  }

  // 基于 XIU2 方法：TCP 连接测试
  async tcpConnectTest(ip, port = 80) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      const startTime = Date.now();
      
      socket.setTimeout(5000);
      
      socket.connect(port, ip, () => {
        const latency = Date.now() - startTime;
        socket.destroy();
        resolve({ success: true, latency });
      });
      
      socket.on('error', () => {
        socket.destroy();
        resolve({ success: false, latency: 9999 });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: false, latency: 9999 });
      });
    });
  }

  // 验证 Cloudflare IP（基于 XIU2 的方法）
  async verifyCloudflareIP(ip) {
    try {
      // 测试 Cloudflare 特有的 cdn-cgi/trace
      const response = await axios.get(`http://${ip}/cdn-cgi/trace`, {
        timeout: 8000,
        headers: {
          'User-Agent': 'CloudflareSpeedTest/1.0'
        }
      });
      
      if (response.status === 200 && response.data) {
        const trace = response.data.toString();
        // 检查 Cloudflare 特征
        return trace.includes('fl=') && 
               trace.includes('colo=') && 
               trace.includes('ip=');
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  // 获取地理位置信息
  async getLocation(ip) {
    try {
      const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,org,lat,lon`, {
        timeout: 5000
      });
      
      if (response.data.status === 'success') {
        return {
          country: response.data.country || 'Unknown',
          region: response.data.regionName || 'Unknown', 
          city: response.data.city || 'Unknown',
          isp: response.data.isp || response.data.org || 'Unknown',
          lat: response.data.lat || 0,
          lon: response.data.lon || 0
        };
      }
    } catch (error) {
      console.log(`获取 ${ip} 地理位置失败:`, error.message);
    }
    
    return { 
      country: 'Unknown', 
      region: 'Unknown', 
      city: 'Unknown', 
      isp: 'Unknown',
      lat: 0,
      lon: 0
    };
  }

  // 扫描单个 Cloudflare IP（基于 XIU2 方法）
  async scanCloudflareIP(ip) {
    console.log(`[CF] 测试 IP: ${ip}`);
    
    // 1. TCP 连接测试
    const tcpResult = await this.tcpConnectTest(ip, 80);
    if (!tcpResult.success || tcpResult.latency > 800) {
      console.log(`✗ [CF] ${ip} TCP连接失败 (${tcpResult.latency}ms)`);
      return null;
    }
    
    // 2. Cloudflare 验证
    const isCloudflare = await this.verifyCloudflareIP(ip);
    if (!isCloudflare) {
      console.log(`✗ [CF] ${ip} 不是有效的 Cloudflare IP`);
      return null;
    }
    
    // 3. 下载速度测试
    const speedResult = await this.downloadSpeedTest(ip);
    if (!speedResult.success) {
      console.log(`✗ [CF] ${ip} 下载测试失败`);
      return null;
    }
    
    console.log(`✓ [CF] ${ip} 测试成功 - 延迟: ${speedResult.latency}ms, 速度: ${(speedResult.speed/1024).toFixed(2)} KB/s`);
    
    // 4. 获取地理位置
    const location = await this.getLocation(ip);
    
    return {
      ip,
      type: 'cloudflare',
      latency: speedResult.latency,
      speed: speedResult.speed,
      speedKBps: Math.round(speedResult.speed / 1024),
      tcpLatency: tcpResult.latency,
      httpStatus: speedResult.httpStatus,
      dataSize: speedResult.dataSize,
      alive: true,
      location,
      lastTest: new Date().toISOString()
    };
  }

  // 扫描代理 IP
  async scanProxyIP(ip) {
    console.log(`[PROXY] 测试 IP: ${ip}`);
    
    // TCP 连接测试
    const tcpResult = await this.tcpConnectTest(ip, 80);
    if (!tcpResult.success || tcpResult.latency > 1000) {
      console.log(`✗ [PROXY] ${ip} TCP连接失败 (${tcpResult.latency}ms)`);
      return null;
    }
    
    // HTTP 连通性测试
    try {
      const startTime = Date.now();
      const response = await axios.get(`http://${ip}`, {
        timeout: 8000,
        validateStatus: () => true,
        maxRedirects: 0
      });
      
      const httpLatency = Date.now() - startTime;
      
      if (response.status >= 200 && response.status < 500) {
        console.log(`✓ [PROXY] ${ip} 测试成功 - TCP: ${tcpResult.latency}ms, HTTP: ${httpLatency}ms`);
        
        const location = await this.getLocation(ip);
        
        return {
          ip,
          type: 'proxy',
          latency: httpLatency,
          tcpLatency: tcpResult.latency,
          httpStatus: response.status,
          alive: true,
          location,
          lastTest: new Date().toISOString()
        };
      }
    } catch (error) {
      console.log(`✗ [PROXY] ${ip} HTTP测试失败: ${error.message}`);
    }
    
    return null;
  }

  // 执行扫描（基于 XIU2 的批量测试方法）
  async performScan(options = {}) {
    if (this.isScanning) {
      console.log('扫描已在进行中...');
      return;
    }

    this.isScanning = true;
    console.log('开始基于 XIU2/CloudflareSpeedTest 方法的扫描...');

    const {
      cloudflareScanCount = 50,
      proxyScanCount = 30,
      ipsPerCidr = 5,
      concurrency = 5
    } = options;

    try {
      // 生成 Cloudflare IP
      console.log('从 Cloudflare CIDR 生成测试 IP...');
      const cfIPs = [];
      for (const cidr of this.cloudflareCIDRs) {
        cfIPs.push(...this.generateIPsFromCIDR(cidr, ipsPerCidr));
      }
      const cloudflareIPs = cfIPs.slice(0, cloudflareScanCount);
      
      // 生成代理 IP
      console.log('从代理服务商 CIDR 生成测试 IP...');
      const proxyIPs = [];
      for (const cidr of this.proxyCIDRs) {
        proxyIPs.push(...this.generateIPsFromCIDR(cidr, ipsPerCidr));
      }
      const testProxyIPs = proxyIPs.slice(0, proxyScanCount);

      const cloudflareResults = [];
      const proxyResults = [];

      // 批量测试 Cloudflare IP
      console.log(`开始测试 ${cloudflareIPs.length} 个 Cloudflare IP...`);
      for (let i = 0; i < cloudflareIPs.length; i += concurrency) {
        const batch = cloudflareIPs.slice(i, i + concurrency);
        const batchPromises = batch.map(ip => this.scanCloudflareIP(ip));
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
          if (result) {
            cloudflareResults.push(result);
          }
        }
        
        // 避免过于频繁的请求
        await this.delay(500);
      }

      // 批量测试代理 IP
      console.log(`开始测试 ${testProxyIPs.length} 个代理 IP...`);
      for (let i = 0; i < testProxyIPs.length; i += concurrency) {
        const batch = testProxyIPs.slice(i, i + concurrency);
        const batchPromises = batch.map(ip => this.scanProxyIP(ip));
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
          if (result) {
            proxyResults.push(result);
          }
        }
        
        await this.delay(500);
      }

      // 排序结果
      this.results = {
        cloudflare: cloudflareResults
          .sort((a, b) => a.latency - b.latency)
          .slice(0, 30),
        proxyIPs: proxyResults
          .sort((a, b) => a.latency - b.latency)
          .slice(0, 20),
        lastUpdate: new Date().toISOString()
      };

      console.log(`扫描完成！`);
      console.log(`Cloudflare: ${this.results.cloudflare.length} 个有效IP`);
      console.log(`代理: ${this.results.proxyIPs.length} 个有效IP`);
      
      await this.saveResults();

    } catch (error) {
      console.error('扫描出错:', error);
    } finally {
      this.isScanning = false;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveResults() {
    try {
      const dataDir = path.join(__dirname, '../data');
      await fs.mkdir(dataDir, { recursive: true });
      
      await fs.writeFile(
        path.join(dataDir, 'results.json'),
        JSON.stringify(this.results, null, 2)
      );
      console.log(`结果已保存: Cloudflare ${this.results.cloudflare.length} 个, 代理 ${this.results.proxyIPs.length} 个`);
    } catch (error) {
      console.error('保存结果失败:', error);
    }
  }

  async loadResults() {
    try {
      const dataPath = path.join(__dirname, '../data/results.json');
      const data = await fs.readFile(dataPath, 'utf8');
      
      if (!data.trim()) {
        console.log('结果文件为空，将执行初始扫描');
        return;
      }
      
      const parsedData = JSON.parse(data);
      
      if (parsedData && parsedData.cloudflare && parsedData.proxyIPs) {
        this.results = parsedData;
        console.log(`已加载结果: Cloudflare ${this.results.cloudflare.length} 个, 代理 ${this.results.proxyIPs.length} 个`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('未找到结果文件，将执行初始扫描');
      } else {
        console.log('加载结果出错，将重新扫描:', error.message);
      }
    }
  }

  getResults() {
    return this.results;
  }

  getScanStatus() {
    return {
      isScanning: this.isScanning,
      lastUpdate: this.results.lastUpdate
    };
  }
}

module.exports = IPScanner;