// IP数据源配置
const IP_SOURCES = {
    cloudflare: [
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
    
    // 优选域名
    domains: [
      'speed.cloudflare.com',
      'cf.xiu2.xyz',
      'cf.090227.xyz',
      'cfip.gay',
      'ip.164746.xyz',
      'cf.zhetengsha.com',
      'cf-v4.uapis.cn',
      'cf.wangdu.one',
      'cf.ech0.me',
      'cf-v4.uapis.cn',
      'cf.lianyun.org',
      'cf.ygkkk.eu.org',
      'cf.lovestu.com',
      'cf.zhetengsha.com',
      'cf-v4.uapis.cn',
      'cf.wangdu.one',
      'cf.ech0.me',
      'cf.lianyun.org',
      'cf.ygkkk.eu.org',
      'cf.lovestu.com'
    ],
  
    // 代理IP - 使用主要云服务商IP
    proxyIPs: [
      // Microsoft Azure
      '20.189.173.0',
      '20.189.173.1',
      '20.189.173.2',
      '52.146.0.0',
      '52.146.0.1',
      
      // Google Cloud
      '34.102.136.180',
      '34.149.100.209',
      '35.186.224.25',
      '35.199.192.0',
      '35.235.240.0',
      
      // Oracle Cloud
      '129.213.0.0',
      '132.145.0.0',
      '140.238.0.0',
      '147.154.0.0',
      '150.136.0.0',
      
      // DigitalOcean
      '159.89.0.0',
      '165.227.0.0',
      '167.71.0.0',
      '167.172.0.0'
    ]
  };
  
  // 生成随机IP
  function generateRandomIPs(cidr, count = 5) {
    const ips = [];
    const [network, prefix] = cidr.split('/');
    const prefixNum = parseInt(prefix);
    
    // 简化的IP生成逻辑
    const baseIP = network.split('.').map(Number);
    const hostBits = 32 - prefixNum;
    const maxHosts = Math.pow(2, hostBits) - 2;
    
    for (let i = 0; i < count; i++) {
      const randomHost = Math.floor(Math.random() * maxHosts) + 1;
      const ip = [...baseIP];
      
      // 简单的IP计算
      let carry = randomHost;
      for (let j = 3; j >= 0; j--) {
        ip[j] += carry % 256;
        carry = Math.floor(carry / 256);
        if (ip[j] > 255) {
          ip[j] = ip[j] % 256;
          carry += 1;
        }
      }
      
      ips.push(ip.join('.'));
    }
    
    return ips;
  }
  
  // 获取所有IP
  function getAllIPs() {
    const result = {
      cloudflare: [],
      domains: IP_SOURCES.domains.slice(0, 20),
      proxyIPs: IP_SOURCES.proxyIPs.slice(0, 20)
    };
    
    // 从每个CIDR生成一些随机IP
    IP_SOURCES.cloudflare.forEach(cidr => {
      result.cloudflare.push(...generateRandomIPs(cidr, 3));
    });
    
    // 限制Cloudflare IP数量
    result.cloudflare = result.cloudflare.slice(0, 50);
    
    return result;
  }
  
  module.exports = {
    IP_SOURCES,
    getAllIPs,
    generateRandomIPs
  };