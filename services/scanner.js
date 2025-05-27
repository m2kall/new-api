const ping = require('ping');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const CIDR = require('ip-cidr');

class IPScanner {
  constructor() {
    this.results = {
      cloudflare: [],
      proxyIPs: [],
      lastUpdate: new Date().toISOString()
    };
    this.isScanning = false;

    // 美国云服务IP段（用于生成IP池）
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
    } catch {
      return { alive: false, time: 999, packetLoss: '100%' };
    }
  }

  async testSpeed(host) {
    try {
      const start = Date.now();
      const response = await axios.get(`http://${host}`, {
        timeout: 8000,
        maxRedirects: 0,
        validateStatus: () => true
      });
      const end = Date.now();
      const responseTime = end - start;

      let speed = 'Slow';
      if (responseTime < 500) speed = 'Fast';
      else if (responseTime < 1500) speed = 'Medium';

      return {
        responseTime,
        speed,
        status: response.status
      };
    } catch {
      return { responseTime: 999, speed: 'Timeout', status: 0 };
    }
  }

  async getLocation(ip) {
    try {
      const response = await axios.get(`http://ip-api.com/json/${ip}?fields=country,regionName,city,isp`, {
        timeout: 3000
      });

      if (response.data.status !== 'fail') {
        return {
          country: response.data.country || 'Unknown',
          region: response.data.regionName || 'Unknown',
          city: response.data.city || 'Unknown',
          isp: response.data.isp || 'Unknown'
        };
      }
    } catch {}

    return { country: 'Unknown', region: 'Unknown', city: 'Unknown', isp: 'Unknown' };
  }

  async scanIP(ip) {
    console.log(`Scanning IP: ${ip}`);
    const latency = await this.testLatency(ip);
    if (!latency.alive) return null;

    const speed = await this.testSpeed(ip);
    const location = await this.getLocation(ip);

    return {
      ip,
      latency: latency.time,
      alive: latency.alive,
      packetLoss: latency.packetLoss,
      speed: speed.speed,
      responseTime: speed.responseTime,
      location,
      lastTest: new Date().toISOString()
    };
  }

  getRandomIPsFromCIDRs(cidrs, count = 20) {
    const allIPs = [];
    for (const cidrStr of cidrs) {
      const cidr = new CIDR(cidrStr);
      if (!cidr.isValid()) continue;
      const range = cidr.toArray({ from: 1, limit: 256 }); // 限制提取前256个IP，避免过多
      allIPs.push(...range);
    }

    // 随机取N个IP
    const shuffled = allIPs.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  async performScan() {
    if (this.isScanning) {
      console.log('Scan already in progress...');
      return;
    }

    this.isScanning = true;
    console.log('Starting full IP pool scan...');

    try {
      const cloudflareCIDRs = this.usIpRanges.cloudflare_us;
      const proxyCIDRs = [
        ...this.usIpRanges.aws_us,
        ...this.usIpRanges.google_us,
        ...this.usIpRanges.azure_us,
        ...this.usIpRanges.digitalocean_us
      ];

      const cloudflareIPs = this.getRandomIPsFromCIDRs(cloudflareCIDRs, 20);
      const proxyIPs = this.getRandomIPsFromCIDRs(proxyCIDRs, 20);

      const cloudflareResults = [];
      const proxyResults = [];

      for (const ip of cloudflareIPs) {
        const result = await this.scanIP(ip);
        if (result) {
          cloudflareResults.push(result);
        }
        await this.delay(100);
      }

      for (const ip of proxyIPs) {
        const result = await this.scanIP(ip);
        if (result) {
          proxyResults.push(result);
        }
        await this.delay(100);
      }

      this.results = {
        cloudflare: cloudflareResults.sort((a, b) => a.latency - b.latency).slice(0, 15),
        proxyIPs: proxyResults.sort((a, b) => a.latency - b.latency).slice(0, 15),
        lastUpdate: new Date().toISOString()
      };

      await this.saveResults();
      console.log('Scan completed.');

    } catch (error) {
      console.error('Scan error:', error);
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
      console.log('Results saved successfully');
    } catch (error) {
      console.error('Failed to save results:', error);
    }
  }

  async loadResults() {
    try {
      const dataPath = path.join(__dirname, '../data/results.json');
      const data = await fs.readFile(dataPath, 'utf8');
      this.results = JSON.parse(data);
      console.log('Previous results loaded');
    } catch {
      console.log('No previous results found');
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