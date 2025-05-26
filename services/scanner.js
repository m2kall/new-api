const ping = require('ping');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class IPScanner {
  constructor() {
    this.results = {
      cloudflare: { ipv4: [], ipv6: [] },
      domains: [],
      proxyIPs: { ipv4: [], ipv6: [] },
      lastUpdate: new Date().toISOString()
    };
    this.isScanning = false;
  }

  // 测试延迟
  async testLatency(host) {
    try {
      const result = await ping.promise.probe(host, {
        timeout: 5,
        extra: ['-c', '3']
      });
      
      return {
        alive: result.alive,
        time: result.time === 'unknown' ? 999 : parseFloat(result.time),
        packetLoss: result.packetLoss || '0%'
      };
    } catch (error) {
      return { alive: false, time: 999, packetLoss: '100%' };
    }
  }

  // 测试网络速度（简化版）
  async testSpeed(host) {
    try {
      const start = Date.now();
      const response = await axios.get(`http://${host}`, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: () => true
      });
      const end = Date.now();
      
      const responseTime = end - start;
      const speed = responseTime < 1000 ? 'Fast' : responseTime < 3000 ? 'Medium' : 'Slow';
      
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

  // 获取IP归属地（模拟）
  async getLocation(ip) {
    try {
      // 使用免费的IP地理位置API
      const response = await axios.get(`http://ip-api.com/json/${ip}`, {
        timeout: 5000
      });
      
      if (response.data.status === 'success') {
        return {
          country: response.data.country,
          region: response.data.regionName,
          city: response.data.city,
          isp: response.data.isp
        };
      }
    } catch (error) {
      console.log(`Location lookup failed for ${ip}:`, error.message);
    }
    
    return {
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown',
      isp: 'Unknown'
    };
  }

  // 扫描单个IP
  async scanIP(ip, type = 'ipv4') {
    console.log(`Scanning ${ip}...`);
    
    const latency = await this.testLatency(ip);
    const speed = await this.testSpeed(ip);
    const location = await this.getLocation(ip);
    
    return {
      ip,
      type,
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
    console.log(`Scanning domain ${domain}...`);
    
    const latency = await this.testLatency(domain);
    const speed = await this.testSpeed(domain);
    
    return {
      domain,
      latency: latency.time,
      alive: latency.alive,
      speed: speed.speed,
      responseTime: speed.responseTime,
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
    console.log('Starting IP scan...');

    try {
      // 扫描Cloudflare IPv4
      const cloudflareIPv4 = [];
      for (const ip of ipSources.cloudflare.slice(0, 20)) {
        const result = await this.scanIP(ip, 'ipv4');
        if (result.alive) {
          cloudflareIPv4.push(result);
        }
      }

      // 扫描代理IP
      const proxyIPv4 = [];
      for (const ip of ipSources.proxyIPs.slice(0, 15)) {
        const result = await this.scanIP(ip, 'ipv4');
        if (result.alive) {
          proxyIPv4.push(result);
        }
      }

      // 扫描域名
      const domains = [];
      for (const domain of ipSources.domains.slice(0, 15)) {
        const result = await this.scanDomain(domain);
        if (result.alive) {
          domains.push(result);
        }
      }

            // 更新结果
            this.results = {
                cloudflare: {
                  ipv4: cloudflareIPv4.sort((a, b) => a.latency - b.latency).slice(0, 20),
                  ipv6: [] // 暂时不扫描IPv6
                },
                domains: domains.sort((a, b) => a.latency - b.latency).slice(0, 20),
                proxyIPs: {
                  ipv4: proxyIPv4.sort((a, b) => a.latency - b.latency).slice(0, 20),
                  ipv6: [] // 暂时不扫描IPv6
                },
                lastUpdate: new Date().toISOString()
              };
        
              // 保存结果到文件
              await this.saveResults();
              console.log('Scan completed successfully');
        
            } catch (error) {
              console.error('Scan error:', error);
            } finally {
              this.isScanning = false;
            }
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
            } catch (error) {
              console.log('No previous results found, using defaults');
            }
          }
        
          // 获取结果
          getResults() {
            return this.results;
          }
        
          // 获取扫描状态
          getScanStatus() {
            return {
              isScanning: this.isScanning,
              lastUpdate: this.results.lastUpdate
            };
          }
        }
        
        module.exports = IPScanner;