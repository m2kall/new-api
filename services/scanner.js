const ping = require('ping');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class IPScanner {
  constructor() {
    this.results = {
      cloudflare: [], // 优选IP（Cloudflare域名和IP）
      proxyIPs: [],   // 代理IP（非Cloudflare的美国IP）
      lastUpdate: new Date().toISOString()
    };
    this.isScanning = false;
  }

  // 测试延迟
  async testLatency(host) {
    try {
      const result = await ping.promise.probe(host, {
        timeout: 3,
        extra: ['-c', '2']
      });
      
      return {
        alive: result.alive,
        time: result.time === 'unknown' ? 999 : parseFloat(result.time) || 999,
        packetLoss: result.packetLoss || '0%'
      };
    } catch (error) {
      console.log(`Ping failed for ${host}:`, error.message);
      return { alive: false, time: 999, packetLoss: '100%' };
    }
  }

  // 简化的速度测试
  async testSpeed(host) {
    try {
      const start = Date.now();
      const response = await axios.get(`http://${host}`, {
        timeout: 5000,
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
    } catch (error) {
      return {
        responseTime: 999,
        speed: 'Timeout',
        status: 0
      };
    }
  }

  // 获取IP归属地
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
    } catch (error) {
      console.log(`Location lookup failed for ${ip}`);
    }
    
    return {
      country: 'Unknown',
      region: 'Unknown', 
      city: 'Unknown',
      isp: 'Unknown'
    };
  }

  // 扫描单个IP
  async scanIP(ip) {
    console.log(`Scanning IP: ${ip}`);
    
    const latency = await this.testLatency(ip);
    if (!latency.alive) {
      return null;
    }

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

  // 扫描域名
  async scanDomain(domain) {
    console.log(`Scanning domain: ${domain}`);
    
    const latency = await this.testLatency(domain);
    if (!latency.alive) {
      return null;
    }

    const speed = await this.testSpeed(domain);
    
    return {
      ip: domain, // 使用域名作为显示
      domain,
      latency: latency.time,
      alive: latency.alive,
      speed: speed.speed,
      responseTime: speed.responseTime,
      location: {
        country: 'Global',
        region: 'CDN',
        city: 'Cloudflare',
        isp: 'Cloudflare'
      },
      lastTest: new Date().toISOString()
    };
  }

  // 执行完整扫描
  async performScan(ipSources) {
    if (this.isScanning) {
      console.log('Scan already in progress...');
      return;
    }

    this.isScanning = true;
    console.log('Starting comprehensive IP scan...');

    try {
      const cloudflareResults = [];
      const proxyResults = [];

      // 扫描Cloudflare优选域名
      console.log('Scanning Cloudflare domains...');
      for (const domain of ipSources.domains.slice(0, 10)) {
        const result = await this.scanDomain(domain);
        if (result) {
          cloudflareResults.push(result);
        }
        await this.delay(100); // 避免请求过快
      }

      // 扫描Cloudflare IP
      console.log('Scanning Cloudflare IPs...');
      for (const ip of ipSources.cloudflare.slice(0, 15)) {
        const result = await this.scanIP(ip);
        if (result) {
          cloudflareResults.push(result);
        }
        await this.delay(100);
      }

      // 扫描代理IP（非Cloudflare）
      console.log('Scanning proxy IPs...');
      for (const ip of ipSources.proxyIPs.slice(0, 15)) {
        const result = await this.scanIP(ip);
        if (result) {
          proxyResults.push(result);
        }
        await this.delay(100);
      }

      // 更新结果
      this.results = {
        cloudflare: cloudflareResults.sort((a, b) => a.latency - b.latency).slice(0, 20),
        proxyIPs: proxyResults.sort((a, b) => a.latency - b.latency).slice(0, 20),
        lastUpdate: new Date().toISOString()
      };

      console.log(`Scan completed. Cloudflare: ${this.results.cloudflare.length}, Proxy: ${this.results.proxyIPs.length}`);
      
      // 保存结果
      await this.saveResults();

    } catch (error) {
      console.error('Scan error:', error);
    } finally {
      this.isScanning = false;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 保存结果到文件
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

  // 加载结果
  async loadResults() {
    try {
      const dataPath = path.join(__dirname, '../data/results.json');
      const data = await fs.readFile(dataPath, 'utf8');
      this.results = JSON.parse(data);
      console.log('Previous results loaded');
    } catch (error) {
      console.log('No previous results found, will perform initial scan');
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