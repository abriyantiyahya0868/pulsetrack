/**
 * PulseTrack Web Analytics Tracker
 * Lightweight (<3KB), privacy-focused, real-time analytics tracker
 * Similar to Histats & Plausible, 100% self-hosted
 */
(function (window, document) {
    'use strict';

    // Prevent double execution
    if (window._pulseTrackLoaded) return;
    window._pulseTrackLoaded = true;

    // Detect current script configuration
    var currentScript = document.currentScript || (function () {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
            if (scripts[i].src && scripts[i].src.indexOf('tracker.js') !== -1) {
                return scripts[i];
            }
        }
        return null;
    })();

    // Auto detect siteId from data attribute, global config, or fallback to current hostname
    var detectedHost = window.location.hostname.replace(/^www\./, '');
    var siteId = (currentScript && currentScript.getAttribute('data-site-id')) || 
                 (currentScript && currentScript.getAttribute('data-domain')) || 
                 window.PULSE_SITE_ID || 
                 (detectedHost && detectedHost !== 'localhost' && detectedHost !== '127.0.0.1' ? detectedHost : 'demo-site-1');
    var badgeTheme = (currentScript && currentScript.getAttribute('data-badge')) || ''; // classic, modern, neon, minimal
    var customApiUrl = (currentScript && currentScript.getAttribute('data-api-url')) || window.PULSE_API_URL || '';
    var autoTrack = currentScript ? (currentScript.getAttribute('data-auto') !== 'false') : true;

    // Base API URL determination
    var apiUrl = customApiUrl;
    if (!apiUrl && currentScript && currentScript.src) {
        var a = document.createElement('a');
        a.href = currentScript.src;
        apiUrl = a.protocol + '//' + a.host;
    }
    if (!apiUrl) {
        apiUrl = window.location.protocol + '//' + window.location.host;
    }

    // Storage helpers
    function getStorage(key, isSession) {
        try {
            return isSession ? window.sessionStorage.getItem(key) : window.localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function setStorage(key, val, isSession) {
        try {
            if (isSession) window.sessionStorage.setItem(key, val);
            else window.localStorage.setItem(key, val);
        } catch (e) { }
    }

    function generateUUID() {
        var d = new Date().getTime();
        var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now() * 1000)) || 0;
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16;
            if (d > 0) {
                r = (d + r) % 16 | 0;
                d = Math.floor(d / 16);
            } else {
                r = (d2 + r) % 16 | 0;
                d2 = Math.floor(d2 / 16);
            }
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // Visitor & Session IDs
    var visitorId = getStorage('_pt_vid');
    if (!visitorId) {
        visitorId = 'v_' + generateUUID();
        setStorage('_pt_vid', visitorId);
    }

    var sessionId = getStorage('_pt_sid', true);
    if (!sessionId) {
        sessionId = 's_' + generateUUID();
        setStorage('_pt_sid', sessionId, true);
    }

    // Client hints
    function getDeviceType() {
        var ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            return 'tablet';
        }
        if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
            return 'mobile';
        }
        return 'desktop';
    }

    function getBrowser() {
        var ua = navigator.userAgent;
        if (ua.indexOf('Firefox') > -1) return 'Firefox';
        if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) return 'Opera';
        if (ua.indexOf('Trident') > -1) return 'Internet Explorer';
        if (ua.indexOf('Edge') > -1 || ua.indexOf('Edg') > -1) return 'Edge';
        if (ua.indexOf('Chrome') > -1) return 'Chrome';
        if (ua.indexOf('Safari') > -1) return 'Safari';
        return 'Other';
    }

    function getOS() {
        var ua = navigator.userAgent;
        if (ua.indexOf('Win') > -1) return 'Windows';
        if (ua.indexOf('Mac') > -1) return (/(iPhone|iPad|iPod)/.test(ua) ? 'iOS' : 'macOS');
        if (ua.indexOf('Android') > -1) return 'Android';
        if (ua.indexOf('Linux') > -1) return 'Linux';
        return 'Other';
    }

    // Send payload to backend
    function sendPayload(endpoint, data) {
        var payload = Object.assign({
            site_id: siteId,
            session_id: sessionId,
            visitor_id: visitorId,
            timestamp: new Date().toISOString()
        }, data);

        var url = apiUrl.replace(/\/+$/, '') + '/api/' + endpoint;

        // Try navigator.sendBeacon if available (ideal for unload/background)
        var jsonStr = JSON.stringify(payload);
        if (navigator.sendBeacon && typeof Blob !== 'undefined') {
            var blob = new Blob([jsonStr], { type: 'application/json' });
            if (navigator.sendBeacon(url, blob)) return;
        }

        // Fallback to fetch / XHR
        if (window.fetch) {
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: jsonStr,
                keepalive: true
            }).catch(function () { });
        } else {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(jsonStr);
        }
    }

    // Extract search engine & keyword from referrer or page search params
    function extractSearchInfo(referrer) {
        var res = { search_engine: '', keyword: '' };
        if (!referrer) return res;

        try {
            var url = new URL(referrer);
            var host = url.hostname.toLowerCase();
            var params = url.searchParams;

            // Detect Search Engine and search query parameter
            if (host.indexOf('google.') > -1) {
                res.search_engine = 'Google';
                res.keyword = params.get('q') || params.get('query') || '';
            } else if (host.indexOf('bing.com') > -1) {
                res.search_engine = 'Bing';
                res.keyword = params.get('q') || '';
            } else if (host.indexOf('yahoo.') > -1) {
                res.search_engine = 'Yahoo';
                res.keyword = params.get('p') || params.get('q') || '';
            } else if (host.indexOf('duckduckgo.com') > -1) {
                res.search_engine = 'DuckDuckGo';
                res.keyword = params.get('q') || '';
            } else if (host.indexOf('yandex.') > -1) {
                res.search_engine = 'Yandex';
                res.keyword = params.get('text') || params.get('q') || '';
            } else if (host.indexOf('baidu.com') > -1) {
                res.search_engine = 'Baidu';
                res.keyword = params.get('wd') || params.get('word') || '';
            } else if (host.indexOf('ecosia.org') > -1) {
                res.search_engine = 'Ecosia';
                res.keyword = params.get('q') || '';
            }
        } catch (e) { }

        return res;
    }

    // URL & UTM parser
    function getUTMParams() {
        var params = {};
        try {
            var search = window.location.search.substring(1);
            if (search) {
                var pairs = search.split('&');
                for (var i = 0; i < pairs.length; i++) {
                    var pair = pairs[i].split('=');
                    var key = decodeURIComponent(pair[0]);
                    var val = decodeURIComponent(pair[1] || '');
                    if (key.indexOf('utm_') === 0 || key === 's' || key === 'q' || key === 'keyword' || key === 'search') {
                        params[key] = val;
                    }
                }
            }
        } catch (e) { }
        return params;
    }

    var startTime = Date.now();
    var currentPath = window.location.pathname;

    // Track Pageview
    function trackPageView(customPath, customTitle) {
        currentPath = customPath || window.location.pathname;
        var title = customTitle || document.title;
        var utm = getUTMParams();
        var refInfo = extractSearchInfo(document.referrer);

        // Fallback keyword from utm_term or on-site search ?s= / ?q=
        var finalKeyword = refInfo.keyword || utm.utm_term || utm.s || utm.q || utm.search || utm.keyword || '';
        var searchEngine = refInfo.search_engine || (finalKeyword && document.referrer.indexOf('google') > -1 ? 'Google' : '');

        var payload = {
            type: 'pageview',
            path: currentPath,
            title: title,
            referrer: document.referrer || '',
            keyword: finalKeyword.trim(),
            search_engine: searchEngine,
            screen: window.screen ? (window.screen.width + 'x' + window.screen.height) : '',
            device: getDeviceType(),
            browser: getBrowser(),
            os: getOS(),
            utm_source: utm.utm_source || '',
            utm_medium: utm.utm_medium || '',
            utm_campaign: utm.utm_campaign || '',
            utm_term: utm.utm_term || ''
        };

        sendPayload('collect', payload);
        startTime = Date.now();
    }

    // Track Custom Event
    function trackEvent(eventName, eventData) {
        if (!eventName) return;
        sendPayload('collect', {
            type: 'event',
            event_name: eventName,
            event_data: typeof eventData === 'object' ? JSON.stringify(eventData) : String(eventData || ''),
            path: currentPath
        });
    }

    // Heartbeat for Realtime Active Visitors & Duration
    function sendHeartbeat() {
        if (document.visibilityState === 'hidden') return;
        var durationSeconds = Math.round((Date.now() - startTime) / 1000);
        sendPayload('collect', {
            type: 'heartbeat',
            path: currentPath,
            title: document.title,
            duration: durationSeconds,
            device: getDeviceType(),
            browser: getBrowser()
        });
    }

    // Setup Heartbeat Interval (every 20s)
    var heartbeatTimer = setInterval(sendHeartbeat, 20000);

    // Visibility change listener
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            sendHeartbeat();
        }
    });

    // Handle SPA navigation (History API)
    if (window.history && window.history.pushState) {
        var originalPushState = window.history.pushState;
        window.history.pushState = function () {
            originalPushState.apply(this, arguments);
            setTimeout(function () {
                if (window.location.pathname !== currentPath) {
                    trackPageView();
                }
            }, 50);
        };
        window.addEventListener('popstate', function () {
            trackPageView();
        });
    }

    // Histats style badge auto-renderer
    function renderBadges() {
        // 1. Check if badge container exists
        var badges = document.querySelectorAll('.pulsetrack-badge, #histats_counter, #pulsetrack_counter, [data-pulsetrack-badge]');
        
        // 2. If data-badge attribute is set on script itself and no container exists, inject after script
        if (badgeTheme && badges.length === 0 && currentScript && currentScript.parentNode) {
            var container = document.createElement('div');
            container.className = 'pulsetrack-badge';
            container.setAttribute('data-theme', badgeTheme);
            container.setAttribute('data-site-id', siteId);
            currentScript.parentNode.insertBefore(container, currentScript.nextSibling);
            badges = [container];
        }

        for (var i = 0; i < badges.length; i++) {
            var el = badges[i];
            var bSiteId = el.getAttribute('data-site-id') || siteId;
            var theme = el.getAttribute('data-theme') || badgeTheme || 'classic'; // classic, modern, neon, minimal
            var statType = el.getAttribute('data-type') || 'all'; // all, online, today, total

            var badgeUrl = apiUrl.replace(/\/+$/, '') + '/api/badge?site_id=' + encodeURIComponent(bSiteId) + '&theme=' + encodeURIComponent(theme) + '&type=' + encodeURIComponent(statType) + '&_t=' + Date.now();
            
            var a = document.createElement('a');
            a.href = apiUrl;
            a.target = '_blank';
            a.title = 'Live Traffic Stats';
            a.style.display = 'inline-block';
            a.style.textDecoration = 'none';

            var img = document.createElement('img');
            img.src = badgeUrl;
            img.alt = 'PulseTrack Live Web Stats';
            img.style.display = 'inline-block';
            img.style.verticalAlign = 'middle';
            img.style.border = '0';
            
            a.appendChild(img);
            el.innerHTML = '';
            el.appendChild(a);
        }
    }

    // Initialize auto tracking
    if (autoTrack) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            trackPageView();
            renderBadges();
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                trackPageView();
                renderBadges();
            });
        }
    }

    // Expose Public API
    window.pulseTrack = {
        pageview: trackPageView,
        event: trackEvent,
        renderBadges: renderBadges,
        siteId: siteId,
        apiUrl: apiUrl
    };

})(window, document);
