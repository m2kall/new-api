const ping = require('ping');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class IPScanner {
  constructor() {
    this.results = {
      cloudflare: [], // 优选IP（Cloudflare IP）
      proxyIPs: [],   // 代理IP（非Cloudflare的美国云服务商IP）
      lastUpdate: new Date().toISOString()
    };
    this.isScanning = false;

    // 美国地区的云服务厂商 IP 段
    this.usIpRanges = {
      cloudflare_us: [
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
      ],
      aws_us: [
        '52.0.0.0/11', '54.0.0.0/8', '3.0.0.0/8', '18.208.0.0/13',
        '34.192.0.0/12', '52.200.0.0/13', '13.52.0.0/14', '13.56.0.0/14'
      ],
      google_us: [
        '35.184.0.0/13', '35.192.0.0/14', '35.196.0.0/15', '35.224.0.0/12',
        '34.64.0.0/10', '104.154.0.0/15', '130.211.0.0/16'
      ],
      azure_us: [
        '13.64.0.0/11', '40.64.0.0/10', '52.224.0.0/11', '20.36.0.0/14',
        '20.40.0.0/13', '104.40.0.0/13', '168.61.0.0/16'
      ],
      digitalocean_us: [
        '104.131.0.0/16', '159.203.0.0/16', '68.183.0.0/16', '167.99.0.0/16',
        '134.209.0.0/16', '165.227.0.0/16'
      ],
      vultr_us: [
        '45.32.0.0/16', '45.63.0.0/16', '45.76.0.0/16', '108.61.0.0/16',
        '149.28.0.0/16', '207.148.0.0/16'
      ],
      linode_us: [
        '45.33.0.0/16', '45.56.0.0/16', '45.79.0.0/16', '172.104.0.0/15',
        '139.144.0.0/16', '96.126.96.0/19'
      ],
      oracle_us: [
        '129.213.0.0/16', '132.145.0.0/16', '140.91.0.0/16', '147.154.0.0/16',
        '152.67.0.0/16', '158.101.0.0/16', '192.29.0.0/16'
      ],
      amazon_us: [ // Amazon 其他服务 (非AWS), 也可以看作代理
        '205.251.192.0/19', '54.230.0.0/16', '99.84.0.0/16', '13.32.0.0/15',
        '13.35.0.0/16', '204.246.164.0/22'
      ]
    };
    this.proxyProviders = ['aws_us', 'google_us', 'azure_us', 'digitalocean_us', 'vultr_us', 'linode_us', 'oracle_us', 'amazon_us']; // 用于代理IP扫描的厂商
  }

  // --- IP 地址转换辅助函数 ---
  ipToInt(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  intToIp(int) {
    return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
  }

  cidrToIpList(cidr, maxIps = 5) { // 每个CIDR默认取5个IP
    const [network, prefixLengthStr] = cidr.split('/');
    const prefix = parseInt(prefixLengthStr);

    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      console.warn(`无效的 CIDR 前缀: ${cidr}`);
      return [];
    }

    const hostBits = 32 - prefix;
    const networkInt = this.ipToInt(network);
    const ips = [];

    // /32: 1 IP (自身)
    // /31: 2 IPs
    // /30: 4 IPs (通常网络和广播不分配，但云提供商可能全部分配)
    // 我们将生成从网络地址开始的IP
    const numPossibleIps = Math.pow(2, hostBits);
    
    // 尝试随机选择起始点，以增加多样性，但要确保在范围内
    let startOffset = 0;
    if (numPossibleIps > maxIps) {
      // 如果CIDR范围远大于我们想取的IP数，随机选一个起始
      startOffset = Math.floor(Math.random() * (numPossibleIps - maxIps));
    }

    for (let i = 0; i < Math.min(numPossibleIps, maxIps); i++) {
      const currentOffset = startOffset + i;
      if (networkInt + currentOffset >= networkInt + numPossibleIps) break; // 防止超出范围
      ips.push(this.intToIp(networkInt + currentOffset));
    }
    return ips;
  }

  generateIpListFromRanges(providerKeys, totalIpsToGenerate, ipsPerCidr = 3) {
    const allIps = [];
    const selectedRanges = [];

    providerKeys.forEach(key => {
      if (this.usIpRanges[key]) {
        selectedRanges.push(...this.usIpRanges[key]);
      }
    });

    if (selectedRanges.length === 0) return [];

    // 如果总 IP 数较少，优先从每个 CIDR 取少量 IP
    // 如果总 IP 数较多，则可能需要从某些 CIDR 取更多 IP 或循环
    const ipsToAttemptPerCidr = Math.max(1, Math.ceil(ipsPerCidr)); // 确保每个 CIDR 至少尝试取一个

    for (const cidr of selectedRanges) {
      if (allIps.length >= totalIpsToGenerate) break;
      const rangeIps = this.cidrToIpList(cidr, ipsToAttemptPerCidr);
      allIps.push(...rangeIps);
    }
    
    // 打乱并截取到目标数量
    return allIps.sort(() => Math.random() - 0.5).slice(0, totalIpsToGenerate);
  }


  // --- 核心扫描逻辑 (与你之前代码类似) ---
  async testLatency(host) {
    try {
      const result = await ping.promise.probe(host, {
        timeout: 5,
        extra: ['-c', '3']
      });
      return {
        alive: result.alive,
        time: result.time === 'unknown' ? 999 : parseFloat(result.time) || 999,
        packetLoss: result.packetLoss || '0%'
      };
    } catch (error) {
      // console.log(`Ping failed for ${host}:`, error.message); // 减少日志输出
      return { alive: false, time: 999, packetLoss: '100%' };
    }
  }

  async testSpeed(host) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时
    const start = Date.now();

    try {
      const response = await axios.get(`http://${host}`, {
        timeout: 8000, // axios 内部超时
        signal: controller.signal, // AbortController
        maxRedirects: 0,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 IPScanner/1.0'
        }
      });
      const end = Date.now();
      clearTimeout(timeoutId);

      const responseTime = end - start;
      let speed = 'Slow';
      if (responseTime < 500) speed = 'Fast';
      else if (responseTime < 1500) speed = 'Medium';
      
      return {
        responseTime,
        speed,
        status: response.status
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const responseTime = Date.now() - start; // 记录实际花费时间，即使是超时
      return {
        responseTime: responseTime > 8000 ? 8000 : responseTime, // 如果是 AbortError，时间可能很短
        speed: 'Timeout',
        status: 0
      };
    }
  }

  async getLocation(ip) {
    try {
      const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp`, {
        timeout: 3000
      });
      
      if (response.data.status === 'success') {
        return {
          country: response.data.country || 'Unknown',
          region: response.data.regionName || 'Unknown',
          city: response.data.city || 'Unknown',
          isp: response.data.isp || 'Unknown'
        };
      }
    } catch (error) {
      // console.log(`Location lookup failed for ${ip}`);
    }
    return { country: 'Unknown', region: 'Unknown', city: 'Unknown', isp: 'Unknown' };
  }

  async scanIP(ip, type = "unknown") { // 添加 type 参数以区分来源
    console.log(`[${type.toUpperCase()}] Scanning IP: ${ip}`);
    
    const latencyResult = await this.testLatency(ip);
    // 对于ping不通的IP，我们仍然尝试HTTP测试，因为有些服务器可能禁ping但服务可用
    // if (!latencyResult.alive) {
    //   return null; // 如果需要严格ping通才继续，则取消注释此行
    // }

    const speedResult = await this.testSpeed(ip);
    
    // 只有当ping通或HTTP测试有响应时，才认为IP有效
    if (!latencyResult.alive && speedResult.status === 0 && speedResult.speed === 'Timeout') {
        console.log(`✗ IP ${ip} completely unresponsive.`);
        return null;
    }


    const location = await this.getLocation(ip);
    
    return {
      ip,
      type, // 记录IP来源类型 (cloudflare, aws_us, google_us 等)
      latency: latencyResult.time,
      alive: latencyResult.alive, // ping存活状态
      packetLoss: latencyResult.packetLoss,
      speed: speedResult.speed,
      responseTime: speedResult.responseTime,
      httpStatus: speedResult.status, // 添加HTTP状态码
      location,
      lastTest: new Date().toISOString()
    };
  }

  // 不再需要 scanDomain，因为我们现在从IP池扫描
  // async scanDomain(domain) { ... }

  async performScan(options = {}) {
    if (this.isScanning) {
      console.log('扫描已在进行中...');
      return;
    }

    this.isScanning = true;
    console.log('开始从IP池进行全面扫描...');

    const {
        cloudflareScanCount = 50, // 扫描多少个Cloudflare IP
        proxyScanCount = 60,      // 扫描多少个其他代理IP
        ipsPerCidrForCloudflare = 3, // 每个Cloudflare CIDR中取多少IP
        ipsPerCidrForProxy = 1,   // 每个其他代理CIDR中取多少IP
        scanDelay = 50,           // 每个IP扫描之间的延迟（毫秒）
    } = options;

    try {
      const cloudflareResults = [];
      const proxyResults = [];

      // 1. 生成并扫描 Cloudflare IP
      console.log(`准备扫描 ${cloudflareScanCount} 个 Cloudflare IP...`);
      const cfIpsToScan = this.generateIpListFromRanges(['cloudflare_us'], cloudflareScanCount, ipsPerCidrForCloudflare);
      console.log(`将从 Cloudflare IP 池中扫描 ${cfIpsToScan.length} 个 IP。`);

      for (const ip of cfIpsToScan) {
        const result = await this.scanIP(ip, 'cloudflare');
        if (result && result.alive && result.httpStatus >= 200 && result.httpStatus < 300) {
          cloudflareResults.push(result);
          console.log(`✓ [CF] IP ${ip} 添加 (延迟: ${result.latency}ms, 响应: ${result.responseTime}ms, HTTP: ${result.httpStatus})`);
        } else {
          console.log(`✗ [CF] IP ${ip} 无有效响应或测试失败`);
        }
        await this.delay(scanDelay);
      }

      // 2. 生成并扫描 Proxy IPs (来自其他云服务商)
      console.log(`准备扫描 ${proxyScanCount} 个代理 IP...`);
      const proxyIpsToScan = this.generateIpListFromRanges(this.proxyProviders, proxyScanCount, ipsPerCidrForProxy);
      console.log(`将从代理 IP 池中扫描 ${proxyIpsToScan.length} 个 IP。`);
      
      for (const ip of proxyIpsToScan) {
        // 找出这个IP属于哪个provider (可选，用于更详细的日志或结果分类)
        let providerOrigin = 'proxy';
        for (const providerKey of this.proxyProviders) {
            if (this.usIpRanges[providerKey].some(range => this.isIpInCidr(ip, range))) {
                providerOrigin = providerKey;
                break;
            }
        }

        const result = await this.scanIP(ip, providerOrigin);
        if (result && result.alive && result.httpStatus >= 200 && result.httpStatus < 300) {
          proxyResults.push(result);
          console.log(`✓ [${providerOrigin.toUpperCase()}] IP ${ip} 添加 (延迟: ${result.latency}ms, 响应: ${result.responseTime}ms, HTTP: ${result.httpStatus})`);
        } else {
          console.log(`✗ [${providerOrigin.toUpperCase()}] IP ${ip} 无有效响应或测试失败`);
        }
        await this.delay(scanDelay);
      }
      
      // Fallback 逻辑可以保留，以防扫描数量不足
      this.addFallbackDataIfNeeded(cloudflareResults, proxyResults);


      this.results = {
        cloudflare: cloudflareResults.sort((a, b) => (a.latency + a.responseTime) - (b.latency + b.responseTime)).slice(0, 25), // 综合排序，保留25个
        proxyIPs: proxyResults.sort((a, b) => (a.latency + a.responseTime) - (b.latency + b.responseTime)).slice(0, 25), // 综合排序，保留25个
        lastUpdate: new Date().toISOString()
      };

      console.log(`扫描完成。Cloudflare 有效IP: ${this.results.cloudflare.length}, 代理有效IP: ${this.results.proxyIPs.length}`);
      await this.saveResults();

    } catch (error) {
      console.error('扫描过程中发生错误:', error);
    } finally {
      this.isScanning = false;
    }
  }

  isIpInCidr(ip, cidr) {
    try {
        const [range, bitsStr] = cidr.split('/');
        const bits = parseInt(bitsStr);
        if (isNaN(bits) || bits < 0 || bits > 32) return false;

        const ipInt = this.ipToInt(ip);
        const rangeInt = this.ipToInt(range);
        const mask = (~0) << (32 - bits);

        return (ipInt & mask) === (rangeInt & mask);
    } catch (e) {
        // console.error(`Error in isIpInCidr for ${ip} and ${cidr}:`, e);
        return false;
    }
  }

  addFallbackDataIfNeeded(cloudflareResults, proxyResults) {
    // 如果扫描结果太少，添加更多默认数据 (与你之前的逻辑类似)
    if (cloudflareResults.length < 5) {
        console.log('Cloudflare 扫描结果不足，添加备用数据...');
        const fallbackCloudflare = [ /* ... 你的 fallbackCloudflare 数据 ... */ ];
        cloudflareResults.push(...fallbackCloudflare.map(item => ({...item, type: 'cloudflare-fallback'})));
    }

    if (proxyResults.length < 5) {
        console.log('代理 IP 扫描结果不足，添加备用数据...');
        const fallbackProxy = [ /* ... 你的 fallbackProxy 数据 ... */ ];
        proxyResults.push(...fallbackProxy.map(item => ({...item, type: 'proxy-fallback'})));
    }
  }


  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveResults() {
    try {
      const dataDir = path.join(__dirname, '../data'); // 假设你的脚本在 src 或类似目录下
      await fs.mkdir(dataDir, { recursive: true });
      
      if (this.results.cloudflare.length === 0 && this.results.proxyIPs.length === 0) {
        console.log('没有数据可保存，跳过...');
        return;
      }
      
      await fs.writeFile(
        path.join(dataDir, 'results.json'),
        JSON.stringify(this.results, null, 2)
      );
      console.log('结果已成功保存:', 
        `Cloudflare: ${this.results.cloudflare.length}, ` +
        `代理: ${this.results.proxyIPs.length}`
      );
    } catch (error) {
      console.error('保存结果失败:', error);
    }
  }

  async loadResults() {
    try {
      const dataPath = path.join(__dirname, '../data/results.json');
      const data = await fs.readFile(dataPath, 'utf8');
      const parsedData = JSON.parse(data);
      // 基本验证，确保加载的数据结构是我们期望的
      if (parsedData && parsedData.cloudflare && parsedData.proxyIPs && parsedData.lastUpdate) {
        this.results = parsedData;
        console.log('已加载之前的扫描结果。');
      } else {
        console.log('加载的结果文件格式不正确，将执行初始扫描。');  
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('未找到之前的扫描结果文件，将执行初始扫描。');
      } else {
        console.error('加载结果时发生错误:', error);
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

// --- 示例用法 (取消注释以在单独运行时测试) ---
/*
async function main() {
  const scanner = new IPScanner();
  await scanner.loadResults(); // 尝试加载旧结果

  console.log("当前结果:", scanner.getResults());

  // 可以通过 options 自定义扫描数量
  await scanner.performScan({
    cloudflareScanCount: 10, // 测试时减少数量
    proxyScanCount: 15,      // 测试时减少数量
    ipsPerCidrForCloudflare: 1,
    ipsPerCidrForProxy: 1,
    scanDelay: 100
  });

  console.log("扫描后结果:", scanner.getResults());
}

// main(); // 取消注释以运行
*/