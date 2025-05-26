const axios = require('axios');
const ping = require('ping');

// 美国代理IP扫描
async function scanProxyIPs() {
    const results = [];
    
    try {
        // 从多个免费代理API获取美国IP
        const proxyAPIs = [
            'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=US&format=json',
            'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt'
        ];

        for (const apiUrl of proxyAPIs) {
            try {
                const response = await axios.get(apiUrl, { timeout: 10000 });
                let proxies = [];

                if (apiUrl.includes('proxyscrape')) {
                    proxies = response.data.map(proxy => ({
                        ip: proxy.ip,
                        port: proxy.port,
                        country: proxy.country || 'US'
                    }));
                } else {
                    // 解析文本格式的代理列表
                    const lines = response.data.split('\n');
                    proxies = lines
                        .filter(line => line.trim() && line.includes(':'))
                        .map(line => {
                            const [ip, port] = line.trim().split(':');
                            return { ip, port: parseInt(port), country: 'US' };
                        })
                        .slice(0, 50); // 限制数量
                }

                // 验证IP并排除Cloudflare IP
                for (const proxy of proxies) {
                    if (await isValidProxyIP(proxy.ip)) {
                        const region = await getIPRegion(proxy.ip);
                        
                        // 检查是否为IPv4或IPv6
                        const ipType = isIPv6(proxy.ip) ? 'IPv6' : 'IPv4';
                        
                        results.push({
                            ip: proxy.ip,
                            port: proxy.port,
                            type: ipType,
                            region: region || 'Unknown',
                            format: `${ipType} #${region || 'Unknown'}`
                        });
                    }
                }
            } catch (error) {
                console.error(`API ${apiUrl} 请求失败:`, error.message);
            }
        }

        // 去重并限制结果数量
        const uniqueResults = results.filter((item, index, self) => 
            index === self.findIndex(t => t.ip === item.ip)
        ).slice(0, 100);

        return uniqueResults;
    } catch (error) {
        console.error('代理IP扫描错误:', error.message);
        return [];
    }
}

// Cloudflare优选IP扫描
async function scanCloudflareIPs() {
    const results = [];
    
    try {
        // Cloudflare IP段
        const cfIPRanges = [
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

        // 从每个IP段中选择一些IP进行测试
        for (const range of cfIPRanges) {
            const ips = generateIPsFromRange(range, 10); // 每个段生成10个IP
            
            for (const ip of ips) {
                try {
                    const latency = await testCloudflareIP(ip);
                    if (latency > 0 && latency < 200) { // 延迟小于200ms的优选IP
                        const speed = await testNetworkSpeed(ip);
                        const region = await getIPRegion(ip);
                        const ipType = isIPv6(ip) ? 'IPv6' : 'IPv4';
                        
                        results.push({
                            ip: ip,
                            latency: latency,
                            speed: speed,
                            type: ipType,
                            region: region || 'US',
                            format: `${ipType} #${latency}ms，${speed}，${region || 'US'}`
                        });
                    }
                } catch (error) {
                    // 忽略单个IP的错误
                }
            }
        }

        // 按延迟排序并返回前50个
        return results
            .sort((a, b) => a.latency - b.latency)
            .slice(0, 50);

    } catch (error) {
        console.error('Cloudflare IP扫描错误:', error.message);
        return [];
    }
}

// 测试网络速度的函数
async function testNetworkSpeed(ip) {
    try {
        const testSizes = [1024, 5120, 10240]; // 1KB, 5KB, 10KB
        let totalSpeed = 0;
        let validTests = 0;

        for (const size of testSizes) {
            try {
                const start = Date.now();
                const response = await axios.get(`http://${ip}/cdn-cgi/trace`, {
                    timeout: 10000,
                    headers: {
                        'Host': 'cloudflare.com',
                        'Cache-Control': 'no-cache'
                    },
                    responseType: 'text'
                });
                
                const duration = (Date.now() - start) / 1000; // 秒
                const dataSize = response.data.length || size;
                const speed = (dataSize / 1024) / duration; // KB/s
                
                if (speed > 0 && speed < 10000) { // 合理的速度范围
                    totalSpeed += speed;
                    validTests++;
                }
            } catch (error) {
                // 忽略单次测试错误
            }
        }

        if (validTests > 0) {
            const avgSpeed = totalSpeed / validTests;
            if (avgSpeed > 1000) {
                return `${(avgSpeed / 1024).toFixed(1)}MB/s`;
            } else {
                return `${avgSpeed.toFixed(0)}KB/s`;
            }
        }
        
        return '未知速度';
    } catch (error) {
        return '测速失败';
    }
}

// 辅助函数
async function isValidProxyIP(ip) {
    try {
        // 检查是否为Cloudflare IP
        if (await isCloudflareIP(ip)) {
            return false;
        }
        
        // 简单的ping测试
        const result = await ping.promise.probe(ip, { timeout: 5 });
        return result.alive;
    } catch (error) {
        return false;
    }
}

async function isCloudflareIP(ip) {
    try {
        // 简单检查：通过HTTP请求检测CF-RAY头
        const response = await axios.get(`http://${ip}`, {
            timeout: 3000,
            validateStatus: () => true
        });
        return response.headers['cf-ray'] !== undefined;
    } catch (error) {
        return false;
    }
}

async function testCloudflareIP(ip) {
    try {
        const start = Date.now();
        await axios.get(`http://${ip}`, {
            timeout: 5000,
            headers: {
                'Host': 'cloudflare.com'
            },
            validateStatus: () => true
        });
        return Date.now() - start;
    } catch (error) {
        return -1;
    }
}

async function getIPRegion(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=country,regionName,city,isp`, {
            timeout: 3000
        });
        
        if (response.data.status === 'success') {
            const { country, regionName, city, isp } = response.data;
            return `${city || regionName}, ${country}`;
        }
        return 'Unknown';
    } catch (error) {
        // 备用API
        try {
            const response2 = await axios.get(`https://ipapi.co/${ip}/json/`, {
                timeout: 3000
            });
            
            if (response2.data.city && response2.data.country_name) {
                return `${response2.data.city}, ${response2.data.country_name}`;
            }
        } catch (error2) {
            // 忽略备用API错误
        }
        
        return 'Unknown';
    }
}

function isIPv6(ip) {
    return ip.includes(':');
}

function generateIPsFromRange(cidr, count) {
    const ips = [];
    const [baseIP, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength);
    
    // 简化的IP生成逻辑
    const baseIPParts = baseIP.split('.').map(Number);
    const hostBits = 32 - prefix;
    const maxHosts = Math.min(Math.pow(2, hostBits) - 2, count);
    
    for (let i = 1; i <= maxHosts; i++) {
        const ip = [...baseIPParts];
        let carry = i;
        
        for (let j = 3; j >= 0 && carry > 0; j--) {
            ip[j] += carry % 256;
            carry = Math.floor(carry / 256);
            if (ip[j] > 255) {
                carry += Math.floor(ip[j] / 256);
                ip[j] = ip[j] % 256;
            }
        }
        
        if (carry === 0) {
            ips.push(ip.join('.'));
        }
    }
    
    return ips;
}

module.exports = {
    scanProxyIPs,
    scanCloudflareIPs
};