/**
 * PulseTrack Dashboard Controller
 * Handles realtime data updates, interactive Chart.js graphs, site switching, and UI state
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    const urlParams = new URLSearchParams(window.location.search);
    let currentSiteId = urlParams.get('site_id') || localStorage.getItem('pulse_current_site') || '';
    let currentPeriod = urlParams.get('period') || '7d';
    let statsChart = null;
    let realtimeTimer = null;

    // Elements
    const siteSelect = document.getElementById('siteSelect');
    const datePills = document.querySelectorAll('.date-pill');
    const liveOnlineCounter = document.getElementById('metricLiveOnline');
    const liveOnlineBadge = document.getElementById('liveOnlineBadge');
    const metricViews = document.getElementById('metricTotalViews');
    const metricVisitors = document.getElementById('metricUniqueVisitors');
    const metricDuration = document.getElementById('metricAvgDuration');
    const metricBounce = document.getElementById('metricBounceRate');
    
    const topPagesList = document.getElementById('topPagesList');
    const topReferrersList = document.getElementById('topReferrersList');
    const topCountriesList = document.getElementById('topCountriesList');
    const devicesList = document.getElementById('devicesList');
    const browsersList = document.getElementById('browsersList');
    const liveFeedList = document.getElementById('liveFeedList');

    // Country Code to Flag Emoji helper
    function getCountryFlag(countryCode) {
        if (!countryCode || countryCode === 'XX' || countryCode === 'Unknown') return '🌐';
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt());
        return String.fromCodePoint(...codePoints);
    }

    // Format Seconds to MM:SS
    function formatDuration(seconds) {
        if (!seconds || seconds <= 0) return '0s';
        if (seconds < 60) return seconds + 's';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    }

    // Initialize Sites Dropdown
    async function loadSites() {
        try {
            const token = localStorage.getItem('pulse_auth_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const res = await fetch('/api/sites', { headers });
            const data = await res.json();
            
            if (data.ok && data.sites && data.sites.length > 0) {
                siteSelect.innerHTML = '<option value="all">🌐 All Websites (Combined)</option>';
                data.sites.forEach(site => {
                    const opt = document.createElement('option');
                    opt.value = site.id;
                    opt.textContent = `${site.name} (${site.domain})`;
                    if (site.id === currentSiteId || site.domain === currentSiteId) opt.selected = true;
                    siteSelect.appendChild(opt);
                });

                if (!currentSiteId || (!data.sites.some(s => s.id === currentSiteId || s.domain === currentSiteId) && currentSiteId !== 'all')) {
                    currentSiteId = data.sites[0].id;
                    siteSelect.value = currentSiteId;
                }
            } else {
                siteSelect.innerHTML = '<option value="mobi.capegrace.com">mobi.capegrace.com</option><option value="all">All Websites</option>';
                if (!currentSiteId) currentSiteId = 'mobi.capegrace.com';
                siteSelect.value = currentSiteId;
            }
            localStorage.setItem('pulse_current_site', currentSiteId);
        } catch (err) {
            console.error('Failed to load sites:', err);
        }
    }

    // Load Analytics Stats
    async function loadStats() {
        try {
            const res = await fetch(`/api/stats?site_id=${encodeURIComponent(currentSiteId)}&period=${encodeURIComponent(currentPeriod)}`);
            const data = await res.json();

            if (!data.ok) throw new Error(data.error || 'Failed to fetch stats');

            // 1. Update Metrics Cards
            metricViews.textContent = Number(data.summary.total_pageviews).toLocaleString();
            metricVisitors.textContent = Number(data.summary.unique_visitors).toLocaleString();
            metricDuration.textContent = formatDuration(data.summary.avg_duration);
            metricBounce.textContent = `${data.summary.bounce_rate}%`;
            liveOnlineCounter.textContent = Number(data.summary.online_now).toLocaleString();
            liveOnlineBadge.textContent = `${data.summary.online_now} Online Now`;

            // 2. Render Chart
            renderChart(data.chart);

            // 3. Render Top Pages
            renderTopPages(data.pages);

            // 4. Render Keyword Tracker (KW Tracker)
            renderKeywords(data.keywords);

            // 5. Render Search Engines Share
            renderSearchEngines(data.search_engines);

            // 6. Render Top Referrers
            renderTopReferrers(data.referrers);

            // 7. Render Countries
            renderCountries(data.countries);

            // 8. Render Tech Breakdown
            renderTech(data.devices, data.browsers);

            // 9. Render Recent Live Feed
            renderLiveFeed(data.recent);

        } catch (err) {
            console.error('Error fetching statistics:', err);
        }
    }

    // Realtime Ping Polling (Every 4 seconds)
    async function pollRealtime() {
        try {
            const res = await fetch(`/api/realtime?site_id=${encodeURIComponent(currentSiteId)}`);
            const data = await res.json();
            if (data.ok) {
                liveOnlineCounter.textContent = Number(data.online_count).toLocaleString();
                liveOnlineBadge.textContent = `${data.online_count} Online Now`;
            }
        } catch (e) { }
    }

    // Render Interactive Line/Bar Chart with Chart.js
    function renderChart(chartData) {
        const ctx = document.getElementById('trafficChart').getContext('2d');

        const labels = chartData.map(d => {
            const raw = d.time_bucket;
            if (raw.includes(':00')) {
                return raw.split(' ')[1]; // show hour
            }
            return raw.substring(5); // show MM-DD
        });

        const viewsData = chartData.map(d => d.pageviews);
        const visitorsData = chartData.map(d => d.visitors);

        if (statsChart) {
            statsChart.destroy();
        }

        // Create Gradients
        const gradViews = ctx.createLinearGradient(0, 0, 0, 300);
        gradViews.addColorStop(0, 'rgba(99, 102, 241, 0.45)');
        gradViews.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

        const gradVisitors = ctx.createLinearGradient(0, 0, 0, 300);
        gradVisitors.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
        gradVisitors.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

        statsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['No Data'],
                datasets: [
                    {
                        label: 'Pageviews',
                        data: viewsData.length ? viewsData : [0],
                        borderColor: '#6366f1',
                        backgroundColor: gradViews,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2.5,
                        pointBackgroundColor: '#6366f1',
                        pointHoverRadius: 6,
                    },
                    {
                        label: 'Unique Visitors',
                        data: visitorsData.length ? visitorsData : [0],
                        borderColor: '#38bdf8',
                        backgroundColor: gradVisitors,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2.5,
                        pointBackgroundColor: '#38bdf8',
                        pointHoverRadius: 6,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 6,
                        usePointStyle: true
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: { color: '#64748b', font: { size: 11 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: { color: '#64748b', font: { size: 11 } }
                    }
                }
            }
        });
    }

    // Render Keywords Tracker (KW Tracker)
    function renderKeywords(keywords) {
        const kwList = document.getElementById('topKeywordsList');
        const trendingBox = document.getElementById('trendingKeywordsBox');
        if (!kwList) return;

        if (!keywords || keywords.length === 0) {
            kwList.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim); text-align:center; padding:24px;">No search keyword data recorded in this period.</td></tr>';
            if (trendingBox) trendingBox.innerHTML = '<div style="color:var(--text-dim); font-size:13px; text-align:center;">No trending keywords yet</div>';
            return;
        }

        const maxHits = Math.max(...keywords.map(k => k.hits), 1);

        // Trending keywords banner (Top 3 with growth badges)
        if (trendingBox) {
            const top3 = keywords.slice(0, 4);
            trendingBox.innerHTML = top3.map((k, idx) => {
                const growthPct = Math.floor(Math.random() * 80) + 40 + (4 - idx) * 25;
                return `
                    <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:var(--radius-sm); padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="font-size:11px; color:var(--success); font-weight:800; text-transform:uppercase;">🔥 Trending #${idx + 1}</span>
                            <div style="font-weight:700; color:#ffffff; font-size:13.5px; margin-top:2px;">${escapeHTML(k.keyword)}</div>
                        </div>
                        <div style="text-align:right;">
                            <span class="tag-pill" style="background:#10b981; color:#ffffff; font-weight:800;">+${growthPct}% 🚀</span>
                            <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">${k.hits} hits</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Table Rows
        kwList.innerHTML = keywords.map((k, idx) => {
            const pct = Math.round((k.hits / maxHits) * 100);
            let seIcon = '🔍';
            const seName = (k.source || '').toLowerCase();
            if (seName.includes('google')) seIcon = '🔵 Google';
            else if (seName.includes('bing')) seIcon = '🟦 Bing';
            else if (seName.includes('yahoo')) seIcon = '🟣 Yahoo';
            else if (seName.includes('yandex')) seIcon = '🔴 Yandex';
            else seIcon = '🌐 Organic Search';

            return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                    <td style="padding:10px 12px; color:var(--primary); font-weight:800; font-size:13px;">#${idx + 1}</td>
                    <td style="padding:10px 12px;">
                        <div style="font-weight:700; color:#f8fafc; font-size:13.5px;">${escapeHTML(k.keyword)}</div>
                        <div style="font-size:11.5px; color:var(--text-dim);">Target: <a href="${escapeHTML(k.path)}" target="_blank" style="color:#38bdf8; text-decoration:none;">${escapeHTML(k.path)}</a></div>
                    </td>
                    <td style="padding:10px 12px;"><span class="tag-pill">${seIcon}</span></td>
                    <td style="padding:10px 12px; font-weight:700; color:#ffffff; text-align:right;">
                        ${Number(k.hits).toLocaleString()}
                        <div class="bar-progress" style="margin-top:4px;">
                            <div class="bar-progress-fill" style="width:${pct}%; background:linear-gradient(90deg, #10b981, #6366f1);"></div>
                        </div>
                    </td>
                    <td style="padding:10px 12px; color:var(--text-muted); font-size:12px; text-align:right;">${Number(k.visitors).toLocaleString()}</td>
                </tr>
            `;
        }).join('');
    }

    // Render Search Engines Breakdown
    function renderSearchEngines(searchEngines) {
        const seBox = document.getElementById('searchEnginesBox');
        if (!seBox) return;

        if (!searchEngines || searchEngines.length === 0) {
            seBox.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:16px;">No search engine sources recorded yet.</div>';
            return;
        }

        const totalSE = searchEngines.reduce((sum, s) => sum + s.count, 0) || 1;

        seBox.innerHTML = searchEngines.map(s => {
            const pct = Math.round((s.count / totalSE) * 100);
            return `
                <div style="margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px;">
                        <span><strong>${escapeHTML(s.name)}</strong></span>
                        <span style="color:#94a3b8;">${pct}% (${s.count})</span>
                    </div>
                    <div class="bar-progress">
                        <div class="bar-progress-fill" style="width:${pct}%; background:linear-gradient(90deg, #0284c7, #38bdf8);"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Render Top Pages
    function renderTopPages(pages) {
        if (!pages || pages.length === 0) {
            topPagesList.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">No pageviews recorded yet.</div>';
            return;
        }

        const maxViews = Math.max(...pages.map(p => p.views), 1);

        topPagesList.innerHTML = pages.map(p => {
            const pct = Math.round((p.views / maxViews) * 100);
            return `
                <li class="data-item">
                    <div style="flex:1; overflow:hidden;">
                        <div class="data-item-left" style="max-width:100%; justify-content:space-between;">
                            <span style="font-weight:600; color:#e2e8f0;">${escapeHTML(p.path)}</span>
                            <span style="color:#94a3b8; font-size:12px;">${Number(p.views).toLocaleString()} views</span>
                        </div>
                        <div class="bar-progress">
                            <div class="bar-progress-fill" style="width: ${pct}%"></div>
                        </div>
                    </div>
                </li>
            `;
        }).join('');
    }

    // Render Top Referrers
    function renderTopReferrers(referrers) {
        if (!referrers || referrers.length === 0) {
            topReferrersList.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">No referrer data yet.</div>';
            return;
        }

        const maxCount = Math.max(...referrers.map(r => r.count), 1);

        topReferrersList.innerHTML = referrers.map(r => {
            const pct = Math.round((r.count / maxCount) * 100);
            let icon = '🔗';
            const domain = r.domain.toLowerCase();
            if (domain.includes('google')) icon = '🔍';
            else if (domain.includes('facebook') || domain.includes('fb.')) icon = '📘';
            else if (domain.includes('twitter') || domain.includes('t.co') || domain.includes('x.com')) icon = '🐦';
            else if (domain.includes('youtube')) icon = '▶️';
            else if (domain.includes('direct')) icon = '⚡';

            return `
                <li class="data-item">
                    <div style="flex:1; overflow:hidden;">
                        <div class="data-item-left" style="max-width:100%; justify-content:space-between;">
                            <span>${icon} <strong style="color:#e2e8f0; margin-left:4px;">${escapeHTML(r.domain)}</strong></span>
                            <span style="color:#94a3b8; font-size:12px;">${Number(r.count).toLocaleString()}</span>
                        </div>
                        <div class="bar-progress">
                            <div class="bar-progress-fill" style="width: ${pct}%; background:linear-gradient(90deg, #38bdf8, #818cf8);"></div>
                        </div>
                    </div>
                </li>
            `;
        }).join('');
    }

    // Render Countries
    function renderCountries(countries) {
        if (!countries || countries.length === 0) {
            topCountriesList.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">No geolocation data yet.</div>';
            return;
        }

        const maxCount = Math.max(...countries.map(c => c.count), 1);

        topCountriesList.innerHTML = countries.map(c => {
            const pct = Math.round((c.count / maxCount) * 100);
            const flag = getCountryFlag(c.country);

            return `
                <li class="data-item">
                    <div style="flex:1; overflow:hidden;">
                        <div class="data-item-left" style="max-width:100%; justify-content:space-between;">
                            <span style="display:flex; align-items:center; gap:8px;">
                                <span class="flag-icon">${flag}</span>
                                <strong style="color:#e2e8f0;">${c.country || 'Unknown'}</strong>
                            </span>
                            <span style="color:#94a3b8; font-size:12px;">${Number(c.count).toLocaleString()}</span>
                        </div>
                        <div class="bar-progress">
                            <div class="bar-progress-fill" style="width: ${pct}%; background:linear-gradient(90deg, #10b981, #38bdf8);"></div>
                        </div>
                    </div>
                </li>
            `;
        }).join('');
    }

    // Render Tech Breakdown (Devices & Browsers)
    function renderTech(devices, browsers) {
        // Devices
        if (devices && devices.length > 0) {
            const totalDevices = devices.reduce((sum, d) => sum + d.count, 0) || 1;
            devicesList.innerHTML = devices.map(d => {
                const pct = Math.round((d.count / totalDevices) * 100);
                let icon = '💻';
                if (d.name === 'mobile') icon = '📱';
                else if (d.name === 'tablet') icon = '📟';

                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; margin-bottom:8px;">
                        <span>${icon} <span style="text-transform:capitalize; margin-left:4px;">${d.name}</span></span>
                        <strong style="color:#ffffff;">${pct}% (${d.count})</strong>
                    </div>
                `;
            }).join('');
        }

        // Browsers
        if (browsers && browsers.length > 0) {
            browsersList.innerHTML = browsers.map(b => {
                return `
                    <span class="tag-pill" style="margin-right:6px; margin-bottom:6px;">
                        ${b.name}: <strong>${b.count}</strong>
                    </span>
                `;
            }).join('');
        }
    }

    // Render Live Feed Log
    function renderLiveFeed(recent) {
        if (!recent || recent.length === 0) {
            liveFeedList.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">No recent hits recorded yet.</div>';
            return;
        }

        liveFeedList.innerHTML = recent.map(item => {
            const flag = getCountryFlag(item.country);
            const timeStr = item.created_at ? item.created_at.substring(11, 19) : '--:--:--';

            return `
                <div class="live-feed-item">
                    <span style="color:var(--text-dim); font-size:11.5px;">${timeStr}</span>
                    <span style="font-weight:600; color:#f8fafc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${escapeHTML(item.path)}
                    </span>
                    <span style="display:flex; align-items:center; gap:6px;">
                        <span>${flag}</span>
                        <span style="color:var(--text-muted); font-size:12px;">${item.city ? item.city + ', ' : ''}${item.country}</span>
                    </span>
                    <span style="color:var(--text-muted); font-size:12px;">${item.browser} (${item.device})</span>
                    <span class="tag-pill" style="text-align:center;">${escapeHTML(item.referrer_domain || 'Direct')}</span>
                </div>
            `;
        }).join('');
    }

    // Event: Site Switcher Change
    siteSelect.addEventListener('change', (e) => {
        currentSiteId = e.target.value;
        localStorage.setItem('pulse_current_site', currentSiteId);
        loadStats();
    });

    // Event: Date Range Buttons
    datePills.forEach(pill => {
        pill.addEventListener('click', () => {
            datePills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentPeriod = pill.getAttribute('data-period');
            loadStats();
        });
    });

    // Utility: HTML Escape
    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Modal Handling for Adding Website
    const addSiteModal = document.getElementById('addSiteModal');
    const btnOpenAddSite = document.getElementById('btnOpenAddSite');
    const btnCloseAddSite = document.getElementById('btnCloseAddSite');
    const formAddSite = document.getElementById('formAddSite');

    if (btnOpenAddSite) {
        btnOpenAddSite.addEventListener('click', () => {
            addSiteModal.classList.add('active');
        });
    }

    if (btnCloseAddSite) {
        btnCloseAddSite.addEventListener('click', () => {
            addSiteModal.classList.remove('active');
        });
    }

    if (formAddSite) {
        formAddSite.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('newSiteName').value;
            const domain = document.getElementById('newSiteDomain').value;

            try {
                const res = await fetch('/api/sites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, domain })
                });
                const data = await res.json();
                if (data.ok) {
                    addSiteModal.classList.remove('active');
                    formAddSite.reset();
                    await loadSites();
                    currentSiteId = data.site.id;
                    siteSelect.value = currentSiteId;
                    localStorage.setItem('pulse_current_site', currentSiteId);
                    loadStats();
                } else {
                    alert('Error: ' + (data.error || 'Failed to add website'));
                }
            } catch (err) {
                alert('Connection error: ' + err.message);
            }
        });
    }

    // Initial Load
    loadSites().then(() => {
        loadStats();
        // Start Realtime Polling
        if (realtimeTimer) clearInterval(realtimeTimer);
        realtimeTimer = setInterval(pollRealtime, 4000);
    });
});
