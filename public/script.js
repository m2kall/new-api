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
        // 每5分钟刷新一次数据
        setInterval(() => this.loadAllData(), 300000);
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabPanels = document.querySelectorAll('.tab-panel');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                tabPanels.forEach(panel => panel.classList.remove('active'));
                document.getElementById(tabId).classList.add('active');
                
                this.currentTab = tabId;
            });
        });
    }

    async loadAllData() {
        await Promise.all([
            this.loadCloudflareIPs(),
            this.loadProxyIPs()
        ]);
    }

    async loadCloudflareIPs() {
        try {
            const response = await fetch('/api/cloudflare-ips');
            const result = await response.json();
            
            if (result.success) {
                this.renderIPs(result.data, 'cloudflare-list');
                this.updateLastUpdate(result.lastUpdate);
            }
        } catch (error) {
            console.error('Failed to load Cloudflare IPs:', error);
            this.showError('cloudflare-list', '加载失败');
        }
    }

    async loadProxyIPs() {
        try {
            const response = await fetch('/api/proxy-ips');
            const result = await response.json();
            
            if (result.success) {
                this.renderIPs(result.data, 'proxy-list');
            }
        } catch (error) {
            console.error('Failed to load proxy IPs:', error);
            this.showError('proxy-list', '加载失败');
        }
    }

    renderIPs(ips, containerId) {
        const container = document.getElementById(containerId);
        
        if (!ips || ips.length === 0) {
            container.innerHTML = '<div class="no-data">暂无可用数据，请等待扫描完成...</div>';
            return;
        }

        container.innerHTML = ips.map(ip => `
            <div class="ip-card">
                <div class="ip-header">
                    <span class="ip-address">${ip.ip}</span>
                </div>
                <div class="ip-details">
                    <div class="detail-item">
                        <span class="detail-label">延迟 (HTTP):</span>
                        <span class="detail-value">${ip.responseTime}ms</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">丢包率:</span>
                        <span class="detail-value">${ip.packetLoss}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">状态:</span>
                        <span class="detail-value">${ip.alive && ip.httpStatus >= 200 && ip.httpStatus < 300 ? '在线' : '离线'}</span>
                    </div>
                </div>
                <div class="location">
                    📍 ${ip.location.country} ${ip.location.region} ${ip.location.city} - ${ip.location.isp}
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

document.addEventListener('DOMContentLoaded', () => {
    new CloudflareIPApp();
});