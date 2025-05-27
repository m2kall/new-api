const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('node:fs'); // 导入 fs 模块
const execAsync = promisify(exec);

class Scanner {
  constructor() {
    this.isScanning = false;
    this.results = []; // 初始化，后续 performScan 会赋值为对象

    // 美国地区的云服务厂商 IP 段
    this.usIpRanges = {
      cloudflare_us: [
        '173.245.48.0/20',    // 美国西海岸
        '104.16.0.0/13',      // 美国数据中心
        '104.24.0.0/14',      // 美国CDN节点
        '172.64.0.0/13',      // 美国主要节点
        '108.162.192.0/18',   // 美国东海岸
        '198.41.128.0/17'     // 美国中部
      ],
      aws_us: [
        '52.0.0.0/11',        // 美国东部 (弗吉尼亚)
        '54.0.0.0/8',         // 美国各区域
        '3.0.0.0/8',          // 美国新分配段
        '18.208.0.0/13',      // 美国东部-1
        '34.192.0.0/12',      // 美国东部-2
        '52.200.0.0/13',      // 美国西部
        '13.52.0.0/14',       // 美国西部-1
        '13.56.0.0/14'        // 美国西部-2
      ],
      google_us: [
        '35.184.0.0/13',      // 美国中部
        '35.192.0.0/14',      // 美国东部
        '35.196.0.0/15',      // 美国西部
        '35.224.0.0/12',      // 美国各区域
        '34.64.0.0/10',       // 美国主要段
        '104.154.0.0/15',     // 美国计算引擎
        '130.211.0.0/16'      // 美国负载均衡
      ],
      azure_us: [
        '13.64.0.0/11',       // 美国东部
        '40.64.0.0/10',       // 美国中部
        '52.224.0.0/11',      // 美国西部
        '20.36.0.0/14',       // 美国东部-2
        '20.40.0.0/13',       // 美国中部-2
        '104.40.0.0/13',      // 美国南部
        '168.61.0.0/16'       // 美国各区域
      ],
      digitalocean_us: [
        '104.131.0.0/16',     // 纽约数据中心
        '159.203.0.0/16',     // 纽约数据中心-2
        '68.183.0.0/16',      // 纽约数据中心-3
        '167.99.0.0/16',      // 旧金山数据中心
        '134.209.0.0/16',     // 旧金山数据中心-2
        '165.227.0.0/16'      // 美国各地
      ],
      vultr_us: [
        '45.32.0.0/16',       // 美国东海岸
        '45.63.0.0/16',       // 美国中部
        '45.76.0.0/16',       // 美国西海岸
        '108.61.0.0/16',      // 美国主要节点
        '149.28.0.0/16',      // 美国新节点
        '207.148.0.0/16'      // 美国扩展段
      ],
      linode_us: [
        '45.33.0.0/16',       // 美国东部
        '45.56.0.0/16',       // 美国中部
        '45.79.0.0/16',       // 美国西部
        '172.104.0.0/15',     // 美国主要段
        '139.144.0.0/16',     // 美国新段
        '96.126.96.0/19'      // 美国传统段
      ],
      oracle_us: [
        '129.213.0.0/16',     // 美国东部 (阿什本)
        '132.145.0.0/16',     // 美国西部 (凤凰城)
        '140.91.0.0/16',      // 美国中部 (芝加哥)
        '147.154.0.0/16',     // 美国西部 (圣何塞)
        '152.67.0.0/16',      // 美国东部扩展
        '158.101.0.0/16',     // 美国西部扩展
        '192.29.0.0/16'       // 美国传统段
      ],
      amazon_us: [
        // Amazon 其他服务 (非AWS)
        '205.251.192.0/19',   // CloudFront 美国
        '54.230.0.0/16',      // CloudFront 美国-2
        '99.84.0.0/16',       // CloudFront 美国-3
        '13.32.0.0/15',       // CloudFront 美国-4
        '13.35.0.0/16',       // CloudFront 美国-5
        '204.246.164.0/22'    // Route53 美国
      ]
    };
  }

  // 将 CIDR 转换为 IP 列表
  cidrToIpList(cidr, maxIps = 50) {
    const [network, prefixLengthStr] = cidr.split('/');
    const prefix = parseInt(prefixLengthStr);

    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      console.warn(`Invalid CIDR prefix: ${cidr}`);
      return [];
    }
    
    const hostBits = 32 - prefix;
    // For /32, hostBits = 0, Math.pow(2,0) = 1. Max IPs from range = 1 (the IP itself).
    // For /31, hostBits = 1, Math.pow(2,1) = 2. Max IPs from range = 2.
    // Original -2 was for "usable" hosts, excluding network/broadcast.
    // If we want to include the network address itself (for /32) or both (for /31),
    // we adjust the logic. For scanning, we usually want specific IPs.
    // A /32 refers to a single IP. A /31 to two.
    // Let's consider a /32 should yield 1 IP, and /31 should yield 2 IPs.
    // Current code with `i=1` and `maxHosts = Math.pow(2, hostBits) - 2` will yield 0 for /31 and /32.
    // If maxIps is small, it will be the limiter.
    // For scanning tools, it's common to scan all IPs in a small range.
    // Let's adjust to allow scanning the network address itself if it's the only one (e.g. /32).
    
    let numPossibleHosts = Math.pow(2, hostBits);
    if (prefix === 32) numPossibleHosts = 1; // Special case for /32
    // For other cases, network and broadcast are typically not assigned or scanned.
    // However, for Cloud providers, IPs in CIDR might be individually assignable.
    // Let's allow generating up to numPossibleHosts, starting from networkInt.
    // The loop will start from 0 (network address) up to numPossibleHosts -1.

    const networkInt = this.ipToInt(network);
    const ips = [];
    
    // Max hosts calculation: if prefix is /30, /31, /32
    // /32: hostBits=0, 2^0=1. Loop from 0 to 0. networkInt + 0. (1 IP)
    // /31: hostBits=1, 2^1=2. Loop from 0 to 1. networkInt + 0, networkInt + 1. (2 IPs)
    // /30: hostBits=2, 2^2=4. Loop from 0 to 3. networkInt + 0, ..., networkInt + 3. (4 IPs)
    // The original code started loop from 1 and subtracted 2 from numPossibleHosts,
    // which is standard for finding *usable* host addresses in traditional networking.
    // For scanning cloud provider ranges, it might be okay to scan all, including network/broadcast if they could be active.
    // Let's stick to the common interpretation of generating assignable IPs within the range,
    // avoiding the explicit network and broadcast addresses for ranges larger than /30.
    
    let startOffset = 0;
    let endBound = numPossibleHosts;

    if (hostBits >= 2) { // For /30 and larger subnets, skip network and broadcast
        startOffset = 1;
        endBound = numPossibleHosts - 1;
    }
    
    const availableIpsCount = Math.max(0, endBound - startOffset);
    const ipsToGenerate = Math.min(availableIpsCount, maxIps);

    for (let i = 0; i < ipsToGenerate; i++) {
      const ip = this.intToIp(networkInt + startOffset + i);
      ips.push(ip);
    }
    
    return ips;
  }

  // IP 地址转整数
  ipToInt(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  // 整数转 IP 地址
  intToIp(int) {
    return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
  }

  // 生成要扫描的美国 IP 列表
  generateUSIpList(provider, count = 100) {
    const ranges = this.usIpRanges[provider] || [];
    if (count === 0 || ranges.length === 0) return [];

    const ips = [];
    const ipsPerRange = Math.max(1, Math.ceil(count / ranges.length)); // Ensure at least 1 IP per range if count > 0

    for (const range of ranges) {
      const rangeIps = this.cidrToIpList(range, ipsPerRange);
      ips.push(...rangeIps);
      if (ips.length >= count) break;
    }
    
    return ips.sort(() => Math.random() - 0.5).slice(0, count);
  }

  async performScan(options = {}) {
    if (this.isScanning) {
      throw new Error('扫描正在进行中');
    }

    this.isScanning = true;
    this.results = []; // Reset results

    try {
      const { 
        cloudflareCount = 50, 
        proxyCount = 50,
        timeout = 5000,
        providers = ['aws_us', 'google_us', 'azure_us', 'digitalocean_us', 'vultr_us', 'linode_us', 'oracle_us', 'amazon_us']
      } = options;

      const cloudflareIps = this.generateUSIpList('cloudflare_us', cloudflareCount);
      
      const proxyIps = [];
      if (proxyCount > 0 && providers.length > 0) {
        const ipsPerProvider = Math.ceil(proxyCount / providers.length);
        for (const provider of providers) {
          const providerIpsList = this.generateUSIpList(provider, ipsPerProvider);
          proxyIps.push(...providerIpsList);
          // It's okay if we overshoot proxyCount here, it will be sliced later.
        }
      }
      // Ensure exactly proxyCount (or fewer if not enough generated) are scanned
      const finalProxyIpsToScan = proxyIps.sort(() => Math.random() - 0.5).slice(0, proxyCount);


      console.log(`开始扫描美国地区 ${cloudflareIps.length} 个 Cloudflare IP 和 ${finalProxyIpsToScan.length} 个代理 IP`);

      const cloudflarePromises = cloudflareIps.map(ip => this.scanSingleIP(ip, 'cloudflare', timeout));
      const proxyPromises = finalProxyIpsToScan.map(ip => this.scanSingleIP(ip, 'proxy', timeout));

      const [cloudflareScanResults, proxyScanResults] = await Promise.all([
        Promise.allSettled(cloudflarePromises),
        Promise.allSettled(proxyPromises)
      ]);

      const validCloudflare = cloudflareScanResults
        .filter(result => result.status === 'fulfilled' && result.value && result.value.alive && this.isUSLocation(result.value.location))
        .map(result => result.value)
        .sort((a, b) => a.latency - b.latency);

      const validProxy = proxyScanResults
        .filter(result => result.status === 'fulfilled' && result.value && result.value.alive && this.isUSLocation(result.value.location))
        .map(result => result.value)
        .sort((a, b) => a.latency - b.latency);

      this.results = {
        cloudflare: validCloudflare,
        proxy: validProxy,
        scanTime: new Date().toISOString(),
        totalScanned: cloudflareIps.length + finalProxyIpsToScan.length,
        validCount: validCloudflare.length + validProxy.length,
        region: 'United States'
      };

      console.log(`美国地区扫描完成: Cloudflare ${validCloudflare.length}个, 代理 ${validProxy.length}个`);
      
      return this.results;

    } catch (error) {
      console.error('扫描过程中出错:', error);
      this.results = { error: error.message, scanTime: new Date().toISOString() }; // Store error in results
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  isUSLocation(location) {
    if (!location || !location.country) return true; 
    
    const country = location.country.toLowerCase();
    // More precise checks for 'us'
    return country === 'united states' || 
           country === 'usa' || 
           country === 'us' || // Exact match for "us"
           country === 'united states of america';
  }

  async scanSingleIP(ip, type, timeout = 5000) {
    try {
      const pingResult = await this.pingIP(ip, timeout);
      const ipLocation = await this.getIPLocation(ip); // Get location regardless of ping status

      if (!pingResult.alive) {
        return {
          ip,
          type,
          alive: false,
          latency: pingResult.latency, // Will be 9999
          packetLoss: pingResult.packetLoss, // Will be 100%
          speed: 'Timeout',
          responseTime: timeout,
          location: ipLocation,
          lastTest: new Date().toISOString()
        };
      }

      const httpResult = await this.testHTTPResponse(ip, timeout);
      
      return {
        ip,
        type,
        alive: true,
        latency: pingResult.latency,
        packetLoss: pingResult.packetLoss,
        speed: this.calculateSpeed(pingResult.latency, httpResult.responseTime),
        responseTime: httpResult.responseTime,
        location: ipLocation,
        lastTest: new Date().toISOString()
      };

    } catch (error) {
      // This catch is for unexpected errors during scanSingleIP execution itself
      console.error(`扫描 ${ip} 时发生意外错误:`, error.message);
      return {
        ip,
        type,
        alive: false,
        latency: 9999,
        packetLoss: '100%',
        speed: 'Error',
        responseTime: timeout,
        location: { country: 'Unknown', region: 'Unknown', city: 'Unknown', isp: 'Unknown' }, // Attempt to get location might have failed too
        lastTest: new Date().toISOString()
      };
    }
  }

  async pingIP(ip, timeout = 5000) {
    try {
      const command = process.platform === 'win32' 
        ? `ping -n 4 -w ${timeout} ${ip}`
        : `ping -c 4 -W ${Math.ceil(timeout / 1000)} ${ip}`; // -W is timeout per reply in seconds
      
      const { stdout } = await execAsync(command, { timeout }); // Add overall timeout to execAsync
      
      if (process.platform === 'win32') {
        const lossMatch = stdout.match(/\((\d+)% loss\)/);
        const timeMatch = stdout.match(/Average = (\d+)ms/);
        
        const isAlive = timeMatch !== null; // If Average time is present, consider it alive.
        return {
          alive: isAlive,
          latency: isAlive && timeMatch ? parseInt(timeMatch[1], 10) : 9999,
          packetLoss: lossMatch ? `${lossMatch[1]}%` : (isAlive ? '0%' : '100%')
        };
      } else { // Linux/macOS
        // If execAsync resolved for Linux ping, it means exit code was 0 (success)
        const lossMatch = stdout.match(/(\d+)% packet loss/);
        // User's regex: avg/XXX/YYY/ZZZ where ZZZ is avg if string starts like "min/avg/max/mdev = 1/2/3/4"
        // This regex tries to capture the second number if the line contains 'avg/' followed by two more slashes.
        // E.g., for "rtt min/avg/max/mdev = 4.685/4.901/5.228/0.219 ms", it captures "4.901".
        const timeMatch = stdout.match(/avg\/[^/]*\/[^/]*\/([\d.]+)/) || stdout.match(/min\/avg\/max\/(?:mdev|stddev) = [^/]*\/([\d.]+)\//);


        return {
          alive: true, // execAsync resolved for ping on Linux means success
          latency: timeMatch ? Math.round(parseFloat(timeMatch[1])) : 9999,
          packetLoss: lossMatch ? `${lossMatch[1]}%` : '0%' // If alive and loss not parsed, assume 0%
        };
      }
    } catch (error) {
      // This catch handles execAsync errors (non-zero exit, command timeout, etc.)
      // For Linux, 100% packet loss (exit code 1) lands here.
      return {
        alive: false,
        latency: 9999,
        packetLoss: '100%'
      };
    }
  }

  async testHTTPResponse(ip, timeout = 5000) {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`http://${ip}`, { // Using http, ensure target IP serves on port 80
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      return {
        responseTime: Date.now() - startTime,
        status: response.status
      };
    } catch (error) {
      if (error.name === 'AbortError') { // Timeout
        return {
          responseTime: Date.now() - startTime, // Approx. timeout duration
          status: 0 // Or use a specific timeout code like 408
        };
      }
      return { // Other errors
        responseTime: Date.now() - startTime,
        status: 0 // Generic error
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  calculateSpeed(latency, responseTime) {
    if (latency === 9999 && responseTime === 0) return 'N/A'; // If HTTP failed but ping was okay.
    const avgTime = (latency + responseTime) / 2;
    
    if (avgTime < 100) return 'Fast';
    if (avgTime < 300) return 'Medium';
    if (avgTime < 600) return 'Slow';
    return 'Very Slow';
  }

  async getIPLocation(ip) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout for location API

    try {
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'IPLocationChecker/1.0' } // Optional: Custom User-Agent
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          return {
            country: data.country || 'Unknown',
            region: data.regionName || 'Unknown',
            city: data.city || 'Unknown',
            isp: data.isp || 'Unknown'
          };
        } else {
          // console.warn(`IP API returned error for ${ip}: ${data.message}`);
        }
      } else {
        // console.warn(`IP API request for ${ip} failed with HTTP status ${response.status}`);
      }
    } catch (error) {
      if (error.name !== 'AbortError') { // Don't log AbortError as it's an expected timeout
        console.error(`获取 ${ip} 位置信息失败:`, error.message);
      }
    } finally {
      clearTimeout(timeoutId);
    }
    
    return { country: 'Unknown', region: 'Unknown', city: 'Unknown', isp: 'Unknown' };
  }

  getResults() {
    return this.results;
  }

  isCurrentlyScanning() {
    return this.isScanning;
  }

  async exportResults(filepath) {
    // Check if results is an object and has data, or if it's still the initial empty array
    if (!this.results || (Array.isArray(this.results) && this.results.length === 0) || (typeof this.results === 'object' && !Array.isArray(this.results) && Object.keys(this.results).length === 0) || this.results.error) {
      throw new Error('没有可导出的有效扫描结果或扫描包含错误');
    }

    const exportData = {
      ...(typeof this.results === 'object' && !Array.isArray(this.results) ? this.results : { data: this.results }), // Handle if results is still array
      exportTime: new Date().toISOString(),
      metadata: {
        version: '2.0.1', // Incremented version
        region: 'United States',
        providers: Object.keys(this.usIpRanges)
      }
    };

    try {
      await fs.promises.writeFile(
        filepath,
        JSON.stringify(exportData, null, 2),
        'utf8'
      );
      console.log(`结果已导出到: ${filepath}`);
      return true;
    } catch (error) {
      console.error('导出结果时出错:', error);
      throw error;
    }
  }

  async importResults(filepath) {
    if (this.isScanning) {
      throw new Error('扫描正在进行中，无法导入结果。');
    }
    try {
      const data = await fs.promises.readFile(filepath, 'utf8');
      const parsedData = JSON.parse(data);
      // Basic validation of imported structure (optional but good)
      if (parsedData && (parsedData.cloudflare || parsedData.proxy) && parsedData.scanTime) {
         this.results = parsedData;
         console.log(`已从 ${filepath} 导入扫描结果`);
         return this.results;
      } else {
        throw new Error('导入的文件格式无效。');
      }
    } catch (error) {
      console.error('导入结果时出错:', error);
      throw error;
    }
  }
}

module.exports = Scanner;

// 示例用法 (取消注释以测试):
/*
async function main() {
  const scanner = new Scanner();

  // Test CIDR to IP
  // console.log("CIDR /32:", scanner.cidrToIpList("192.168.1.1/32", 5));
  // console.log("CIDR /31:", scanner.cidrToIpList("192.168.1.0/31", 5));
  // console.log("CIDR /30:", scanner.cidrToIpList("192.168.1.0/30", 5));
  // console.log("CIDR /29:", scanner.cidrToIpList("192.168.1.0/29", 10));
  // console.log("Cloudflare IPs:", scanner.generateUSIpList('cloudflare_us', 5));


  try {
    const results = await scanner.performScan({
      cloudflareCount: 10, // 减少数量以加快测试
      proxyCount: 10,      // 减少数量以加快测试
      timeout: 3000        // 缩短超时
    });
    // console.log('扫描结果:', JSON.stringify(results, null, 2));

    if (results && !results.error && (results.cloudflare.length > 0 || results.proxy.length > 0)) {
      await scanner.exportResults('./scan_results_us.json');
      
      // Test import
      // const importedResults = await scanner.importResults('./scan_results_us.json');
      // console.log('导入的结果:', JSON.stringify(importedResults, null, 2));
    } else {
      console.log('没有有效的扫描结果可导出。');
    }

  } catch (error) {
    console.error('主程序运行错误:', error.message);
  }
  
  // Test single IP scan
  // try {
  //   console.log("\nScanning single IP 8.8.8.8 (Google DNS):");
  //   const singleScanResultGoogle = await scanner.scanSingleIP("8.8.8.8", "dns_test", 3000);
  //   console.log(JSON.stringify(singleScanResultGoogle, null, 2));

  //   console.log("\nScanning single IP 1.1.1.1 (Cloudflare DNS):");
  //   const singleScanResultCF = await scanner.scanSingleIP("1.1.1.1", "dns_test", 3000);
  //   console.log(JSON.stringify(singleScanResultCF, null, 2));

  //   console.log("\nScanning non-existent IP 192.0.2.1 (Test IP, likely timeout):");
  //   const singleScanResultNonExistent = await scanner.scanSingleIP("192.0.2.1", "non_existent_test", 2000);
  //   console.log(JSON.stringify(singleScanResultNonExistent, null, 2));

  // } catch (e) {
  //   console.error("Error in single IP scan test:", e);
  // }
}

main();
*/