class CloudflareIPApp {
    constructor() {
        this.currentTab = 'cloudflare';
        this.init();
    }

    init() {
        this.setupTabs();
        this.loadAllData();
        this.startStatusUpdates();
        
        // 每30秒检查一次状态
        setInterval(() => this.updateStatus(), 30000);
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabPanels = document.querySelectorAll('.tab-panel');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                
                // 更新按钮状态
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // 更新面板状态
                tabPanels.forEach(panel => panel.classList.remove('active'));
                document.getElementById(tabId).classList.add('active');
                
                this.currentTab = tabId;
            });
        });
    }

    async loadAllData() {
        await Promise.all([
            this.loadCloudflareIPs(),
            this.loadDomains(),
            this.loadProxyIPs()
        ]);
    }

    async loadCloudflareIPs() {
        try {
            const response = await fetch('/api/cloudflare-ips');
            const result = await response.json();
            
            if (result.success) {
                this.renderIPs(result.data.ipv4, 'cloudflare-ipv4');
                this.updateLastUpdate(result.lastUpdate);
            }
        } catch (error) {
            console.error('Failed to load Cloudflare IPs:', error);
            this.showError('cloudflare-ipv4', '加载失败');
        }
    }

    async loadProxyIPs() {
        try {
            const response = await fetch('/api/proxy-ips');
            const result = await response.json();
            
            if (result.success) {
                this.renderIPs(result.data.ipv4, 'proxy-ipv4');
            }
        } catch (error) {
            console.error('Failed to load proxy IPs:', error);
            this.showError('proxy-ipv4', '加载失败');
        }
    }

    async loadDomains() {
        try {
            const response = await fetch('/api/domains');
            const result = await response.json();
            
            if (result.success) {
                this.renderDomains(result.data, 'domains-list');
            }
        } catch (error) {
            console.error('Failed to load domains:', error);
            this.showError('domains-list', '加载失败');
        }
    }

    renderIPs(ips, containerId) {
        const container = document.getElementById(containerId);
        
        if (!ips || ips.length === 0) {
            container.innerHTML = '<div class="no-data">暂无可用数据</div>';
            return;
        }

        container.innerHTML = ips.map(ip => `
            <div class="ip-card">
                <div class="ip-header">
                    <span class="ip-address">${ip.ip}</span>
                    <span class="latency ${this.getLatencyClass(ip.latency)}">${ip.latency}ms</span>
                </div>
                <div class="ip-details">
                    <div class="detail-item">
                        <span class="detail-label">网络速度:</span>
                        <span class="detail-value">${ip.speed}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">响应时间:</span>
                        <span class="detail-value">${ip.responseTime}ms</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">丢包率:</span>
                        <span class="detail-value">${ip.packetLoss}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">状态:</span>
                        <span class="detail-value">${ip.alive ? '在线' : '离线'}</span>
                    </div>
                </div>
                <div class="location">
                    📍 ${ip.location.country} ${ip.location.region} ${ip.location.city} - ${ip.location.isp}
                </div>
            </div>
        `).join('');
    }

    renderDomains(domains, containerId) {
        const container = document.getElementById(containerId);
        
        if (!domains || domains.length === 0) {
            container.innerHTML = '<div class="no-data">暂无可用数据</div>';
            return;
        }

        container.innerHTML = domains.map(domain => `
            <div class="domain-card">
                <div class="domain-header">
                    <span class="domain-name">${domain.domain}</span>
                    <span class="latency ${this.getLatencyClass(domain.latency)}">${domain.latency}ms</span>
                </div>
                <div class="domain-details">
                    <div class="detail-item">
                        <span class="detail-label">网络速度:</span>
                        <span class="detail-value">${domain.speed}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">响应时间:</span>
                        <span class="detail-value">${domain.responseTime}ms</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">状态:</span>
                        <span class="detail-value">${domain.alive ? '在线' : '离线'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">最后测试:</span>
                        <span class="detail-value">${new Date(domain.lastTest).toLocaleTimeString()}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getLatencyClass(latency) {
        if (latency < 100) return 'excellent';
        if (latency < 300) return 'good';
        return 'poor';
    }

    async updateStatus() {
        try {
            const response = await fetch('/api/status');
            const result = await response.json();
            
            if (result.success) {
                const statusElement = document.getElementById('scanStatus');
                if (result.status.isScanning) {
                    statusElement.textContent = '扫描中...';
                    statusElement.className = 'status-scanning';
                } else {
                    statusElement.textContent = '空闲';
                    statusElement.className = 'status-idle';
                }
            }
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    }

    updateLastUpdate(timestamp) {
        const element = document.getElementById('lastUpdate');
        const date = new Date(timestamp);
        element.textContent = `最后更新: ${date.toLocaleString()}`;
    }

    showError(containerId, message) {
        const container = document.getElementById(containerId);
        container.innerHTML = `<div class="no-data">❌ ${message}</div>`;
    }

    startStatusUpdates() {
        this.updateStatus();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new CloudflareIPApp();
});