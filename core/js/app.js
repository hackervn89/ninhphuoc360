// ── Scene Data Registry ──────────────────────────────────────
// Grouped by location for the location switcher & thumbnail panel
// ─────────────────────────────────────────────────────────────
// TODO: Thêm các nhóm địa điểm cho Ninh Phước 360
// Mỗi nhóm cần:
//   - label: Tên hiển thị trên sidebar
//   - firstScene: Scene mặc định khi chọn nhóm
//   - scenes: Mảng các scene, mỗi scene gồm:
//       { id: 'scene_xxx', title: 'Tên', thumb: 'tours/.../thumb.jpg' }
// ─────────────────────────────────────────────────────────────
const tourData = {};

let krpanoObj = null;
let currentTourKey = '';

// History for Back Button
let sceneHistory = [];
let isBackNavigating = false;

// ── Startup ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    embedpano({
        xml: "tour.xml",
        target: "pano",
        html5: "always",
        mobilescale: 1.0,
        passQueryParameters: true,
        onready: krpanoReady
    });

    initUI();
});

// ── KrPano Ready ─────────────────────────────────────────────
function krpanoReady(krpano) {
    krpanoObj = krpano;

    // Loading Progress Check
    const progressInterval = setInterval(() => {
        if (!krpanoObj) return;
        const p = Number(krpanoObj.get("progress.progress")) || 0;
        const pPercent = Math.round(p * 100);

        const bar = document.getElementById('loading-progress');
        const text = document.getElementById('loading-text-percent');
        if (bar) bar.style.width = pPercent + '%';
        if (text) text.textContent = pPercent + '%';

        if (p >= 1.0) {
            clearInterval(progressInterval);
        }
    }, 50);

    // Hide KrPano's default skin UI (keep hotspots)
    const hideLayers = [
        'skin_control_bar', 'skin_control_bar_bg',
        'skin_scroll_window', 'skin_splitter_bottom',
        'skin_btn_prev_fs', 'skin_btn_next_fs', 'skin_title'
    ];
    hideLayers.forEach(name => {
        krpanoObj.call(`set(layer[${name}].visible, false);`);
    });

    // Hook: when scene changes, update Web UI
    krpanoObj.set("events.onnewscene", "js(onSceneChange());");

    // Hide loading screen: use onnewscene (fires when first scene is ready)
    // plus a safety timeout in case something goes wrong
    krpanoObj.set("events.onloadcomplete", "js(hideLoadingScreen());");
    setTimeout(hideLoadingScreen, 5000); // Safety fallback

    // Realtime Sync: Radar Rotation with KrPano camera hlookat
    setInterval(() => {
        if (krpanoObj && radarMarker && leafMap) {
            const mapPanel = document.getElementById('map-panel');
            if (mapPanel && !mapPanel.classList.contains('hidden')) {
                let ath = Number(krpanoObj.get("view.hlookat")) || 0;
                ath = ((ath + 180) % 360 + 360) % 360 - 180;
                const radarEl = document.querySelector('.map-radar');
                if (radarEl) {
                    radarEl.style.transform = `rotate(${ath}deg)`;
                }
            }
        }
    }, 60);

    // Initial UI sync
    setTimeout(onSceneChange, 500);

}

// ── Dynamic Tour Data Builder ────────────────────────────────
async function buildDynamicTourData() {
    if (!krpanoObj) return;

    let locationsMap = {};

    // 1. Fetch static locations.json (works on GitHub Pages, CDNs, and offline)
    try {
        const locRes = await fetch('tours/locations.json');
        if (locRes.ok) {
            locationsMap = await locRes.json();
        }
    } catch (e) {
        // Fallback for static fetch error
    }

    // 2. Fallback to API if static fetch returned empty (e.g. local dev server)
    if (Object.keys(locationsMap).length === 0) {
        try {
            const locRes = await fetch('/api/locations');
            const locData = await locRes.json();
            if (locData && locData.success && locData.locations) {
                locData.locations.forEach(loc => {
                    locationsMap[loc.id] = {
                        name: loc.name,
                        lat: loc.lat,
                        lng: loc.lng
                    };
                });
            }
        } catch (e) { }
    }

    const sceneCount = Number(krpanoObj.get("scene.count")) || 0;
    if (sceneCount === 0) return;

    const newTourData = {};

    for (let i = 0; i < sceneCount; i++) {
        const name = krpanoObj.get(`scene[${i}].name`);
        const title = krpanoObj.get(`scene[${i}].title`) || name;
        let thumb = krpanoObj.get(`scene[${i}].thumburl`) || '';

        let locId = 'default';
        let locLabel = 'Địa điểm Ninh Phước';
        let locLat = null;
        let locLng = null;

        // Extract location folder from thumburl (e.g. "tours/lang_gom/panos/...")
        const folderMatch = thumb.match(/^tours\/([^\/]+)\//);
        if (folderMatch) {
            locId = folderMatch[1];
        }

        if (locationsMap[locId]) {
            if (typeof locationsMap[locId] === 'object') {
                locLabel = locationsMap[locId].name || locId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                locLat = locationsMap[locId].lat || null;
                locLng = locationsMap[locId].lng || null;
            } else {
                locLabel = locationsMap[locId];
            }
        } else if (locId !== 'default') {
            locLabel = locId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }

        if (thumb && !thumb.startsWith('http') && !thumb.startsWith('/')) {
            if (!thumb.startsWith('tours/')) {
                thumb = `tours/${locId}/${thumb}`;
            }
        }

        const sceneLat = krpanoObj.get(`scene[${i}].lat`);
        const sceneLng = krpanoObj.get(`scene[${i}].lng`);
        const hasSceneGps = (sceneLat !== null && sceneLat !== undefined && sceneLat !== '' && sceneLng !== null && sceneLng !== undefined && sceneLng !== '');
        const effectiveLat = hasSceneGps ? Number(sceneLat) : locLat;
        const effectiveLng = hasSceneGps ? Number(sceneLng) : locLng;

        if (!newTourData[locId]) {
            newTourData[locId] = {
                label: locLabel,
                firstScene: name,
                lat: locLat,
                lng: locLng,
                scenes: []
            };
        }

        newTourData[locId].scenes.push({
            id: name,
            title: title,
            thumb: thumb,
            lat: effectiveLat,
            lng: effectiveLng,
            hasCustomGps: hasSceneGps
        });
    }

    // Replace tourData contents
    Object.keys(tourData).forEach(k => delete tourData[k]);
    Object.assign(tourData, newTourData);

    renderSidebar();
}

// ── Scene Change Handler ─────────────────────────────────────
async function onSceneChange() {
    if (!krpanoObj) return;

    const sceneId = krpanoObj.get("xml.scene");
    if (!sceneId) return;

    if (Object.keys(tourData).length === 0) {
        await buildDynamicTourData();
    }

    // Handle History for Back Button
    if (!isBackNavigating) {
        if (sceneHistory.length === 0 || sceneHistory[sceneHistory.length - 1] !== sceneId) {
            sceneHistory.push(sceneId);
        }
    }
    isBackNavigating = false;

    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
        btnBack.style.display = sceneHistory.length > 1 ? 'flex' : 'none';
    }

    // Update thumbnail active state
    document.querySelectorAll('.sidebar-thumb').forEach(card => {
        const isActive = card.dataset.scene === sceneId;
        card.classList.toggle('active', isActive);
        if (isActive) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });

    // Determine current location group & active scene
    let activeLocation = null;
    let currentScene = null;
    for (const [key, data] of Object.entries(tourData)) {
        const found = data.scenes.find(s => s.id === sceneId);
        if (found) {
            activeLocation = data;
            currentScene = found;
            const titleEl = document.getElementById('current-scene-title');
            if (titleEl) titleEl.textContent = `${data.label} - ${found.title}`;
            break;
        }
    }

    // Sync Map Position & Radar to active scene / location (Hierarchy GPS)
    const activeLat = currentScene && currentScene.lat ? currentScene.lat : (activeLocation ? activeLocation.lat : null);
    const activeLng = currentScene && currentScene.lng ? currentScene.lng : (activeLocation ? activeLocation.lng : null);

    if (leafMap && activeLat && activeLng) {
        const pos = [activeLat, activeLng];
        if (radarMarker) radarMarker.setLatLng(pos);
        const mapPanel = document.getElementById('map-panel');
        if (mapPanel && !mapPanel.classList.contains('collapsed') && !mapPanel.classList.contains('hidden') && !mapPanel.classList.contains('maximized')) {
            leafMap.panTo(pos, { animate: true, duration: 0.8 });
        }
    }

    // Auto-hide the sidebar when transitioning to a new scene
    const sidebar = document.getElementById('sidebar');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    if (sidebar && !sidebar.classList.contains('hidden')) {
        setTimeout(() => {
            sidebar.classList.add('hidden');
            if (btnToggleSidebar) btnToggleSidebar.classList.remove('active');
        }, 150);
    }
}

// ── Loading → Intro → Tour Flow ─────────────────────────────
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const loaderPhase = document.getElementById('loader-phase');
    const introPhase = document.getElementById('intro-phase');

    if (loaderPhase) loaderPhase.style.display = 'none';
    if (introPhase) introPhase.classList.remove('hidden');
    if (loadingScreen) loadingScreen.classList.add('show-intro');
}

function startTour() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.classList.add('fade-out');
}

// ── Init UI ──────────────────────────────────────────────────
function initUI() {
    renderSidebar();
    initInfoModal();
    initMapControls();

    // Intro Screen: "Bắt đầu khám phá" button
    const btnStart = document.getElementById('btn-start-tour');
    if (btnStart) {
        btnStart.addEventListener('click', startTour);
    }

    // Sidebar menu toggle & auto-close on click outside
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    const sidebarWrapper = document.getElementById('sidebar-wrapper');

    if (btnToggleSidebar && sidebar) {
        btnToggleSidebar.addEventListener('click', function (e) {
            e.stopPropagation();
            this.classList.toggle('active');
            sidebar.classList.toggle('hidden');
        });

        const closeSidebarIfOutside = (event) => {
            if (!sidebar.classList.contains('hidden')) {
                if (sidebarWrapper && !sidebarWrapper.contains(event.target)) {
                    sidebar.classList.add('hidden');
                    if (btnToggleSidebar) btnToggleSidebar.classList.remove('active');
                }
            }
        };

        document.addEventListener('mousedown', closeSidebarIfOutside);
        document.addEventListener('touchstart', closeSidebarIfOutside, { passive: true });
    }

    // Toggle nav bar
    const btnToggleNav = document.getElementById('btn-toggle-nav');
    if (btnToggleNav) {
        btnToggleNav.addEventListener('click', function () {
            this.classList.toggle('active');
            document.getElementById('nav-controls').classList.toggle('hidden');
        });
    }

    // QR Code for Desktop
    const qrEl = document.getElementById('desktop-qr');
    const qrImg = document.getElementById('qr-img');
    if (qrEl && qrImg && window.innerWidth > 1024) {
        const currentUrl = encodeURIComponent(window.location.href.split('#')[0]);
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${currentUrl}`;
        qrEl.style.display = 'block';
    }

    // Autorotate
    let isAutorotate = false;
    const btnAuto = document.getElementById('btn-autorotate');
    if (btnAuto) {
        btnAuto.addEventListener('click', function () {
            if (!krpanoObj) return;
            isAutorotate = !isAutorotate;
            krpanoObj.set('autorotate.enabled', isAutorotate);
            this.classList.toggle('active', isAutorotate);
        });
    }

    // VR
    document.getElementById('btn-vr')?.addEventListener('click', () => {
        if (krpanoObj) krpanoObj.call("webvr.enterVR();");
    });

    // Fullscreen
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
        if (krpanoObj) krpanoObj.call("switch(fullscreen);");
    });

    // Back Button logic
    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            if (sceneHistory.length > 1) {
                sceneHistory.pop();
                const prevScene = sceneHistory[sceneHistory.length - 1];
                isBackNavigating = true;
                krpanoObj.call(`skin_hidetooltips(); loadscene(${prevScene}, null, MERGE, BLEND(0.5));`);
            }
        });
    }

    // Share Button
    document.getElementById('btn-share')?.addEventListener('click', () => {
        const url = window.location.href;
        if (navigator.share) {
            navigator.share({
                title: 'Ninh Phước 360 - Du lịch Thực tế ảo',
                text: 'Khám phá vẻ đẹp huyện Ninh Phước qua trải nghiệm 360 độ.',
                url: url
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(url).then(() => {
                alert('Đã copy đường dẫn để chia sẻ!');
            });
        }
    });
}

// ── Render Sidebar ───────────────────────────────────────────
function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    const currentSceneId = krpanoObj ? krpanoObj.get("xml.scene") : '';

    for (const [key, data] of Object.entries(tourData)) {
        const group = document.createElement('div');
        const isCurrentGroup = data.scenes.some(s => s.id === currentSceneId);

        const isCollapsed = isCurrentGroup ? '' : 'collapsed';
        group.className = `tour-group ${isCollapsed}`;
        group.id = `group-${key}`;

        const title = document.createElement('div');
        title.className = 'tour-title';
        const iconClass = 'fa-solid fa-location-dot';

        title.innerHTML = `
            <div class="title-icon"><i class="${iconClass}"></i></div>
            <div class="title-text">${data.label}</div>
            <div style="margin-left:auto; font-size:10px; opacity:0.7; background:rgba(255,215,0,0.15); color:var(--primary); padding:2px 8px; border-radius:10px; font-weight:600;">${data.scenes.length} cảnh</div>
        `;

        title.addEventListener('click', () => {
            const isCurrentlyCollapsed = group.classList.contains('collapsed');
            document.querySelectorAll('.tour-group').forEach(g => {
                g.classList.add('collapsed');
            });
            if (isCurrentlyCollapsed) {
                group.classList.remove('collapsed');
            }
        });

        const scenesContainer = document.createElement('div');
        scenesContainer.className = 'tour-scenes';

        data.scenes.forEach(scene => {
            const thumb = document.createElement('div');
            thumb.className = `sidebar-thumb ${scene.id === currentSceneId ? 'active' : ''}`;
            thumb.dataset.scene = scene.id;
            thumb.title = scene.title;
            thumb.innerHTML = `
                <img src="${scene.thumb}" alt="${scene.title}" loading="lazy" onerror="this.onerror=null; this.src='core/assets/og-preview.png';">
                <div class="thumb-label">${scene.title}</div>
            `;
            thumb.addEventListener('click', () => {
                if (krpanoObj) {
                    krpanoObj.call(`loadscene('${scene.id}', null, MERGE, BLEND(0.5))`);
                }
            });
            scenesContainer.appendChild(thumb);
        });

        group.appendChild(title);
        group.appendChild(scenesContainer);
        sidebar.appendChild(group);
    }
}

// ── Google Maps Module (Leaflet + Google Maps Tile gl=VN) ───────────
let leafMap = null;
let googleRoadLayer = null;
let googleSatLayer = null;
let activeMapLayerType = 'road';
let radarMarker = null;
let mapMarkers = [];
let boundaryLayer = null;
let isMapInitializing = false;

function initMapControls() {
    const btnToggleMap = document.getElementById('btn-toggle-map');
    const btnTogglePanel = document.getElementById('btn-toggle-map-panel');
    const mapHeader = document.getElementById('map-header');
    const btnMaximizeMap = document.getElementById('btn-maximize-map');
    const overlay = document.getElementById('map-maximized-overlay');
    const btnRoadLayer = document.getElementById('btn-map-layer-road');
    const btnSatLayer = document.getElementById('btn-map-layer-sat');
    const mapPanel = document.getElementById('map-panel');

    // Header click or arrow click toggles collapse / expand
    const toggleCollapse = (e) => {
        if (e && e.target && (e.target.closest('#btn-maximize-map') || e.target.closest('.map-layer-switch') || e.target.closest('.map-layer-btn'))) {
            return;
        }
        if (!mapPanel) return;
        const isCollapsed = mapPanel.classList.toggle('collapsed');
        if (!isCollapsed) {
            ensureMapInitialized();
            if (btnToggleMap) btnToggleMap.classList.add('active');
        } else {
            if (btnToggleMap) btnToggleMap.classList.remove('active');
        }
    };

    if (btnTogglePanel) {
        btnTogglePanel.addEventListener('click', toggleCollapse);
    }
    if (mapHeader) {
        mapHeader.addEventListener('click', toggleCollapse);
    }

    // Bottom Navigation Bar Map button
    if (btnToggleMap) {
        btnToggleMap.addEventListener('click', () => {
            if (!mapPanel) return;
            if (mapPanel.classList.contains('collapsed')) {
                mapPanel.classList.remove('collapsed');
                ensureMapInitialized();
                btnToggleMap.classList.add('active');
            } else {
                mapPanel.classList.add('collapsed');
                btnToggleMap.classList.remove('active');
            }
        });
    }

    // Maximize / Restore
    if (btnMaximizeMap) {
        btnMaximizeMap.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!mapPanel) return;
            const isMaximized = mapPanel.classList.toggle('maximized');
            if (overlay) overlay.classList.toggle('hidden', !isMaximized);
            if (isMaximized) {
                mapPanel.classList.remove('collapsed');
                ensureMapInitialized();
                setTimeout(() => {
                    if (leafMap) {
                        leafMap.invalidateSize();
                        if (boundaryLayer) {
                            leafMap.fitBounds(boundaryLayer.getBounds(), {
                                padding: [10, 10],
                                animate: true
                            });
                        }
                    }
                }, 350);
            } else {
                setTimeout(() => {
                    if (leafMap) {
                        leafMap.invalidateSize();
                        syncMapToCurrentScene();
                    }
                }, 350);
            }
        });
    }

    // Click on overlay to un-maximize
    if (overlay) {
        overlay.addEventListener('click', () => {
            if (mapPanel) mapPanel.classList.remove('maximized');
            overlay.classList.add('hidden');
            setTimeout(() => {
                if (leafMap) {
                    leafMap.invalidateSize();
                    syncMapToCurrentScene();
                }
            }, 350);
        });
    }

    if (btnRoadLayer) {
        btnRoadLayer.addEventListener('click', (e) => {
            e.stopPropagation();
            switchMapLayer('road');
        });
    }

    if (btnSatLayer) {
        btnSatLayer.addEventListener('click', (e) => {
            e.stopPropagation();
            switchMapLayer('sat');
        });
    }
}

function switchMapLayer(type) {
    if (!leafMap || activeMapLayerType === type) return;
    activeMapLayerType = type;

    const btnRoad = document.getElementById('btn-map-layer-road');
    const btnSat = document.getElementById('btn-map-layer-sat');

    if (type === 'sat') {
        if (googleRoadLayer) leafMap.removeLayer(googleRoadLayer);
        if (googleSatLayer) leafMap.addLayer(googleSatLayer);
        if (btnSat) btnSat.classList.add('active');
        if (btnRoad) btnRoad.classList.remove('active');
    } else {
        if (googleSatLayer) leafMap.removeLayer(googleSatLayer);
        if (googleRoadLayer) leafMap.addLayer(googleRoadLayer);
        if (btnRoad) btnRoad.classList.add('active');
        if (btnSat) btnSat.classList.remove('active');
    }
}

function ensureMapInitialized() {
    if (leafMap) {
        setTimeout(() => leafMap.invalidateSize(), 200);
        return;
    }
    if (isMapInitializing) return;
    isMapInitializing = true;

    if (!window.L) {
        setTimeout(() => {
            isMapInitializing = false;
            ensureMapInitialized();
        }, 150);
        return;
    }

    initGoogleMap();
    isMapInitializing = false;
    setTimeout(() => leafMap.invalidateSize(), 200);
}

function initGoogleMap() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer || leafMap) return;

    // Center map around Ninh Phước (Bàu Trúc: 11.5365, 108.9520)
    leafMap = L.map('map-container', {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
        zoomSnap: 0.1,     // Cho phép zoom mức thập phân (vd: 13.75) để fit sát mép màn hình
        zoomDelta: 0.5     // Bước cuộn zoom mượt mà
    }).setView([11.5365, 108.9520], 14);

    // 1. Google Maps Roadmap Layer (Official Google Tile with Vietnamese territory parameters gl=VN & hl=vi)
    googleRoadLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=vi&gl=VN', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        updateWhenIdle: true,
        keepBuffer: 2
    }).addTo(leafMap);

    // 2. Google Maps Hybrid Satellite Layer (with road names & labels gl=VN)
    googleSatLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=vi&gl=VN', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        updateWhenIdle: true,
        keepBuffer: 2
    });

    // 3. Load & Render Boundary GeoJSON (Ranh giới hành chính Xã Ninh Phước)
    fetch('core/data/ninhphuoc-boundary.json')
        .then(res => {
            if (!res.ok) throw new Error('Không tìm thấy file ranh giới');
            return res.json();
        })
        .then(geoData => {
            boundaryLayer = L.geoJSON(geoData, {
                style: {
                    color: '#c62828',       // Màu đỏ đậm sắc nét (Deep Red)
                    weight: 3,              // Độ dày 3px rõ ràng
                    opacity: 1.0,           // Đậm 100%
                    fillColor: '#d32f2f',   // Màu phủ bóng nhẹ trong khu vực
                    fillOpacity: 0.06,      // Phủ mờ 6%
                    dashArray: null         // Nét liền (Solid Line)
                }
            }).addTo(leafMap);
        })
        .catch(err => console.log('Boundary GeoJSON Info:', err.message));

    // 4. Radar Marker (Direction Cone)
    const radarIcon = L.divIcon({
        className: 'map-radar-wrapper',
        html: '<div class="map-radar"></div>',
        iconSize: [0, 0]
    });
    radarMarker = L.marker([11.5305, 108.9556], { icon: radarIcon, zIndexOffset: 500 }).addTo(leafMap);

    // 5. Glowing Red Markers for Locations
    const glowingIcon = L.divIcon({
        className: 'glowing-marker-wrapper',
        html: '<div class="glowing-marker"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });

    mapMarkers = [];
    Object.entries(tourData).forEach(([locId, group]) => {
        if (group.lat && group.lng) {
            const marker = L.marker([group.lat, group.lng], { icon: glowingIcon, zIndexOffset: 1000 }).addTo(leafMap);

            // Tooltip on Hover
            marker.bindTooltip(group.label, {
                direction: 'top',
                offset: [0, -10],
                className: 'custom-map-tooltip'
            });

            // Rich Popup Card
            const firstThumb = group.scenes && group.scenes[0] ? group.scenes[0].thumb : 'core/assets/og-preview.png';
            const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${group.lat},${group.lng}`;
            const popupHtml = `
                <div class="map-popup-card">
                    <img src="${firstThumb}" alt="${group.label}" style="width:100%; height:84px; object-fit:cover; border-radius:8px; margin-bottom:6px;" onerror="this.onerror=null; this.src='core/assets/og-preview.png';">
                    <div class="map-popup-title">${group.label}</div>
                    <div style="font-size:11px; color:#6b7280; margin-bottom:8px;">${group.scenes.length} cảnh thực tế ảo 360°</div>
                    <div class="map-popup-actions">
                        <button class="btn-popup-teleport" onclick="teleportToLocation('${locId}')">
                            <i class="fa-solid fa-play"></i> Xem 360°
                        </button>
                        <a class="btn-popup-directions" href="${directionsUrl}" target="_blank" rel="noopener noreferrer">
                            <i class="fa-solid fa-diamond-turn-right"></i> Chỉ đường
                        </a>
                    </div>
                </div>
            `;
            marker.bindPopup(popupHtml);

            mapMarkers.push({ locId, marker, firstScene: group.firstScene });
        }
    });

    // Sync initial scene position
    syncMapToCurrentScene();
}

function syncMapToCurrentScene() {
    if (!krpanoObj || !leafMap) return;
    const sceneId = krpanoObj.get("xml.scene");
    if (!sceneId) return;

    for (const [locId, data] of Object.entries(tourData)) {
        const found = data.scenes.find(s => s.id === sceneId);
        if (found) {
            const targetLat = (found.lat !== null && found.lat !== undefined) ? found.lat : data.lat;
            const targetLng = (found.lng !== null && found.lng !== undefined) ? found.lng : data.lng;
            if (targetLat && targetLng) {
                const pos = [targetLat, targetLng];
                if (radarMarker) radarMarker.setLatLng(pos);
                leafMap.panTo(pos, { animate: true, duration: 0.8 });
            }
            break;
        }
    }
}

window.teleportToLocation = function (locId) {
    const group = tourData[locId];
    if (group && group.firstScene && krpanoObj) {
        krpanoObj.call(`loadscene('${group.firstScene}', null, MERGE, BLEND(0.5));`);
        const mapPanel = document.getElementById('map-panel');
        const overlay = document.getElementById('map-maximized-overlay');
        if (mapPanel) {
            if (mapPanel.classList.contains('maximized')) {
                mapPanel.classList.remove('maximized');
                if (overlay) overlay.classList.add('hidden');
            }
            if (window.innerWidth <= 768) {
                mapPanel.classList.add('collapsed');
            }
        }
    }
};

// ── Info Modal Logic ───────────────────────────────────────────
// Dữ liệu thuyết minh được load động từ tours/infos.json
// Soạn thảo nội dung trực tiếp trong Visual Editor (_dev/editor.html)
let infoData = {};

async function loadInfoData() {
    try {
        const res = await fetch(`tours/infos.json?v=${Date.now()}`);
        if (!res.ok) throw new Error('Không tải được infos.json');
        infoData = await res.json();
    } catch (err) {
        console.warn('⚠️ Không tải được dữ liệu thuyết minh:', err.message);
        infoData = {};
    }
}

function initInfoModal() {
    const overlay = document.getElementById('info-modal-overlay');
    const btnClose = document.getElementById('btn-close-modal');

    if (btnClose) {
        btnClose.addEventListener('click', closeInfoModal);
    }

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeInfoModal();
            }
        });
    }
}

// Global function to be called from KrPano
window.openInfoModal = async function (infoId) {
    const overlay = document.getElementById('info-modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');

    if (!overlay || !titleEl || !bodyEl) return;

    // Always reload fresh data so edits in Editor show immediately
    await loadInfoData();

    const data = infoData[infoId];
    if (data) {
        titleEl.innerHTML = data.title + (data.subtitle ? `<br><small style="font-size:0.6em; opacity:0.75; font-weight:400;">${data.subtitle}</small>` : '');
        bodyEl.innerHTML = data.content || '<p><em>Chưa có nội dung.</em></p>';
        overlay.classList.remove('hidden');
    } else {
        titleEl.innerHTML = infoId;
        bodyEl.innerHTML = `<p style="color:#f87171;">⚠️ Không tìm thấy nội dung cho ID: <code>${infoId}</code>.<br>Vui lòng kiểm tra lại trong <strong>Visual Editor → Quản lý Thuyết minh</strong>.</p>`;
        overlay.classList.remove('hidden');
    }
};

function closeInfoModal() {
    const overlay = document.getElementById('info-modal-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}
