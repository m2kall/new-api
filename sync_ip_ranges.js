const fs = require('fs');
const axios = require('axios');

async function fetchCloudflare() {
  // Cloudflare 官网
  const url = 'https://www.cloudflare.com/ips-v4';
  const res = await axios.get(url);
  return res.data.split('\n').filter(x => x && x.includes('.'));
}

async function fetchAWS() {
  // AWS 官方 JSON
  const url = 'https://ip-ranges.amazonaws.com/ip-ranges.json';
  const res = await axios.get(url);
  return res.data.prefixes
    .filter(x => x.region && x.region.startsWith('us-'))
    .map(x => x.ip_prefix);
}

async function fetchGoogle() {
  // Google Cloud 官方文档需手动维护，或用公开整理的列表
  // 这里用 GCP 官方 JSON
  const url = 'https://www.gstatic.com/ipranges/cloud.json';
  const res = await axios.get(url);
  return res.data.prefixes
    .filter(x => x.ipv4Prefix && x.scope && x.scope.startsWith('us-'))
    .map(x => x.ipv4Prefix);
}

async function fetchAzure() {
  // Azure 官方下载地址（需解析JSON）
  // 这里只抓取美国区
  const url = 'https://www.microsoft.com/en-us/download/confirmation.aspx?id=56519';
  // 这里实际下载的是XML或JSON，建议手动维护或用社区整理的列表
  return [];
}

// 其他云厂商可用公开整理的IP段，或手动维护

async function main() {
  const cloudflare = await fetchCloudflare();
  const aws = await fetchAWS();
  const google = await fetchGoogle();
  // Azure、DigitalOcean、Vultr、Linode、Oracle、Amazon 需手动补充

  const ipRanges = {
    cloudflare_us: cloudflare,
    aws_us: aws,
    google_us: google,
    azure_us: [],
    digitalocean_us: [],
    vultr_us: [],
    linode_us: [],
    oracle_us: [],
    amazon_us: []
  };

  fs.writeFileSync('ip-ranges.json', JSON.stringify(ipRanges, null, 2));
  console.log('已同步最新IP段到 ip-ranges.json');
}

main(); 