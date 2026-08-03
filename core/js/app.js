// ── Scene Data Registry ──────────────────────────────────────
// Grouped by location for the location switcher & thumbnail panel
// ─────────────────────────────────────────────────────────────
// TODO: Thêm các nhóm địa điểm cho Ninh Phước 360
// Mỗi nhóm cần:
//   - label: Tên hiển thị trên sidebar
//   - firstScene: Scene mặc định khi chọn nhóm
//   - scenes: Mảng các scene, mỗi scene gồm:
//       { id: 'scene_xxx', title: 'Tên', thumb: 'tours/.../thumb.jpg', lat: xx.xxx, lng: xxx.xxx }
//       - mapTitle (tùy chọn): Tên hiển thị trên bản đồ (nếu khác title)
// ─────────────────────────────────────────────────────────────
const tourData = {
    // === VÍ DỤ CẤU TRÚC (uncomment và sửa khi có panorama) ===
    //
    // diaDiem1: {
    //     label: 'Tên địa điểm 1',
    //     firstScene: 'scene_xxx',
    //     scenes: [
    //         { id: 'scene_xxx', title: 'Tên cảnh', thumb: 'tours/diaDiem1/panos/xxx.tiles/thumb.jpg', lat: 11.xxx, lng: 108.xxx },
    //     ]
    // },
};

let currentTourKey = '';
let leafMap = null;
let radarMarker = null;
let mapMarkers = [];
let isMapInitializing = false;
let boundaryLayer = null;

// History for Back Button
let sceneHistory = [];
let isBackNavigating = false;

// ── Startup ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    embedpano({
        swf: "engine/tour.swf",
        xml: "tour.xml",
        target: "pano",
        html5: "auto",
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

    // Initial UI sync
    setTimeout(onSceneChange, 500);

    // ── Update live coordinates for radar sync ──
    setInterval(() => {
        if (krpanoObj) {
            let ath = Number(krpanoObj.get("view.hlookat"));
            // Normalize ath to -180...180 range
            ath = ((ath + 180) % 360 + 360) % 360 - 180;

            // Sync Radar rotation
            if (radarMarker) {
                const radarEl = document.querySelector('.map-radar');
                if (radarEl) radarEl.style.transform = `rotate(${ath}deg)`;
            }
        }
    }, 100);
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
                    locationsMap[loc.id] = loc.name;
                });
            }
        } catch (e) {}
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

        // Extract location folder from thumburl (e.g. "tours/lang_gom/panos/...")
        const folderMatch = thumb.match(/^tours\/([^\/]+)\//);
        if (folderMatch) {
            locId = folderMatch[1];
        }

        if (locId !== 'default') {
            locLabel = locationsMap[locId] || locId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }

        if (thumb && !thumb.startsWith('http') && !thumb.startsWith('/')) {
            if (!thumb.startsWith('tours/')) {
                thumb = `tours/${locId}/${thumb}`;
            }
        }

        if (!newTourData[locId]) {
            newTourData[locId] = {
                label: locLabel,
                firstScene: name,
                scenes: []
            };
        }

        newTourData[locId].scenes.push({
            id: name,
            title: title,
            thumb: thumb
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

    // Update accordion active state and Location Subtitle
    let activeSceneData = null;
    const titleEl = document.getElementById('current-scene-title');
    for (const [key, data] of Object.entries(tourData)) {
        const found = data.scenes.find(s => s.id === sceneId);
        if (found) {
            activeSceneData = found;
            if (currentTourKey !== key) {
                currentTourKey = key;
            }

            if (titleEl) titleEl.textContent = `${data.label} - ${found.title}`;
            break;
        }
    }

    // Update Map
    if (leafMap && activeSceneData && activeSceneData.lat) {
        const pos = [activeSceneData.lat, activeSceneData.lng];
        leafMap.setView(pos, 16);
        if (radarMarker) radarMarker.setLatLng(pos);
    }

    // Auto-hide the sidebar when transitioning to a new scene
    const sidebar = document.getElementById('sidebar');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    if (sidebar && !sidebar.classList.contains('hidden')) {
        // Delay slightly for a smoother transition feel
        setTimeout(() => {
            sidebar.classList.add('hidden');
            if (btnToggleSidebar) btnToggleSidebar.classList.remove('active');
        }, 150);
    }
}

// ── Loading → Intro → Tour Flow ─────────────────────────────
function hideLoadingScreen() {
    // Phase 1 → Phase 2: Hide spinner, show intro card
    const loadingScreen = document.getElementById('loading-screen');
    const loaderPhase = document.getElementById('loader-phase');
    const introPhase = document.getElementById('intro-phase');

    if (loaderPhase) loaderPhase.style.display = 'none';
    if (introPhase) introPhase.classList.remove('hidden');
    // Reveal panorama behind as blurred background
    if (loadingScreen) loadingScreen.classList.add('show-intro');
}

function startTour() {
    // Phase 2 → Tour: Fade out entire loading screen
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.classList.add('fade-out');

    // GA4 (uncomment khi có tracking ID)
    // if (typeof gtag === 'function') {
    //     gtag('event', 'bat_dau_tham_quan', { event_category: 'tuong_tac' });
    // }

    // Scene preloading is intentionally disabled.
    // In KrPano 1.19, loadscene(..., PRELOAD) can still trigger an unwanted scene switch
    // in this project structure, so user-controlled navigation must take priority.
}

// ── Init UI ──────────────────────────────────────────────────
function initUI() {
    // Render Sidebar
    renderSidebar();
    initInfoModal();

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
        const currentUrl = encodeURIComponent(window.location.href.split('#')[0]); // ignore hash
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

    // Minimap Toggle — lazy init to keep intro/first pano smooth
    const btnToggleMap = document.getElementById('btn-toggle-map');
    const mapPanel = document.getElementById('map-panel');
    const mapHeader = document.getElementById('map-header');
    if (btnToggleMap && mapPanel) {
        // Start collapsed on all devices so Leaflet/map tiles don't compete with intro and first pano.
        mapPanel.classList.add('collapsed');

        const toggleMap = (event) => {
            // Ngăn chặn đóng/mở nếu bấm vào các nút chức năng bên trong header
            if (event && event.target.closest('button')) return;

            if (window.innerWidth <= 1024) {
                // Trên mobile, bấm vào header là phóng to luôn
                toggleMaximize();
            } else {
                mapPanel.classList.toggle('collapsed');
                if (!mapPanel.classList.contains('collapsed')) {
                    ensureMapInitialized();
                }
            }
        };

        btnToggleMap.addEventListener('click', (event) => {
            event.stopPropagation();
            mapPanel.classList.toggle('collapsed');
            if (!mapPanel.classList.contains('collapsed')) {
                ensureMapInitialized();
            }
        });

        if (mapHeader) {
            mapHeader.addEventListener('click', toggleMap);
        }

        // Maximize Map Logic
        const btnMaximize = document.getElementById('btn-maximize-map');
        const mapOverlay = document.getElementById('map-maximized-overlay');

        const toggleMaximize = (forceClose = false) => {
            if (forceClose) {
                mapPanel.classList.remove('maximized');
                mapPanel.classList.add('collapsed'); // Đồng thời ẩn luôn
            } else {
                const wasMaximized = mapPanel.classList.contains('maximized');
                mapPanel.classList.toggle('maximized');

                // Nếu đang từ to chuyển về nhỏ -> ẩn luôn bản đồ
                if (wasMaximized) {
                    mapPanel.classList.add('collapsed');
                } else {
                    mapPanel.classList.remove('collapsed');
                }
            }

            const isMaximized = mapPanel.classList.contains('maximized');

            // Toggle Overlay
            if (mapOverlay) {
                mapOverlay.style.display = isMaximized ? 'block' : 'none';
            }

            if (btnMaximize) {
                btnMaximize.innerHTML = isMaximized
                    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" /></svg>`
                    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>`;
                btnMaximize.title = isMaximized ? "Thu nhỏ bản đồ" : "Phóng to bản đồ";
            }

            ensureMapInitialized();

            setTimeout(() => {
                if (leafMap) {
                    leafMap.invalidateSize({ pan: true });

                    // Sử dụng setView để cố định vị trí và độ phóng đại theo ý muốn
                    if (isMaximized) {
                        // TODO: Đổi tọa độ trung tâm Ninh Phước khi có dữ liệu
                        leafMap.setView([11.5667, 108.9833], 13, {
                            animate: true
                        });
                    }
                }
            }, 550);
        };

        if (btnMaximize) {
            btnMaximize.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleMaximize();
            });
        }

        if (mapOverlay) {
            mapOverlay.addEventListener('click', () => toggleMaximize(true));
        }

        // Close map when clicking outside (Desktop & Mobile)
        document.addEventListener('mousedown', (event) => {
            const isMaximized = mapPanel.classList.contains('maximized');
            const isExpanded = !mapPanel.classList.contains('collapsed');

            if (isMaximized || isExpanded) {
                if (!mapPanel.contains(event.target) && !event.target.closest('.icon-btn') && !event.target.closest('.sidebar-wrapper')) {
                    if (isMaximized) {
                        toggleMaximize(true);
                    } else {
                        mapPanel.classList.add('collapsed');
                    }
                }
            }
        });
    }
}

// ── Map Logic ────────────────────────────────────────────────
function ensureMapInitialized() {
    if (leafMap || isMapInitializing) return;

    isMapInitializing = true;

    // Leaflet is loaded with defer/non-critical priority. If the user opens the
    // map before it is ready, retry briefly instead of blocking initial load.
    if (!window.L) {
        setTimeout(() => {
            isMapInitializing = false;
            ensureMapInitialized();
        }, 200);
        return;
    }

    initMap();
    isMapInitializing = false;
    setTimeout(() => leafMap.invalidateSize(), 50);
    onSceneChange();
}

function initMap() {
    // TODO: Đổi tọa độ mặc định sang trung tâm Ninh Phước
    leafMap = L.map('map-container', {
        zoomControl: false,
        attributionControl: false
    }).setView([11.5667, 108.9833], 15);

    // Premium Satellite Imagery (Esri World Imagery)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
    }).addTo(leafMap);

    // Optional labels overlay
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        opacity: 0.6
    }).addTo(leafMap);

    // Load Administrative Boundary (TODO: Thay bằng GeoJSON ranh giới Ninh Phước)
    fetch('core/data/ninhphuoc-boundary.json')
        .then(response => response.json())
        .then(data => {
            boundaryLayer = L.geoJSON(data, {
                style: {
                    color: '#FFD700', // Vàng Gold
                    weight: 2,        // Thanh mảnh hơn
                    opacity: 0.8,
                    fillColor: '#FFD700',
                    fillOpacity: 0.08, // Trong suốt hơn
                    dashArray: '8, 8',
                    lineJoin: 'round'
                }
            }).addTo(leafMap);
        })
        .catch(err => console.warn('Chưa có file ranh giới GeoJSON:', err));

    // Radar Marker
    const radarIcon = L.divIcon({
        className: 'map-radar-wrapper',
        html: '<div class="map-radar"></div>',
        iconSize: [0, 0]
    });
    radarMarker = L.marker([11.5667, 108.9833], { icon: radarIcon }).addTo(leafMap);

    // Add Markers for all scenes that have coordinates
    const glowingIcon = L.divIcon({
        className: 'glowing-marker-wrapper',
        html: '<div class="glowing-marker"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    Object.values(tourData).forEach(group => {
        group.scenes.forEach(scene => {
            if (scene.lat) {
                const marker = L.marker([scene.lat, scene.lng], { icon: glowingIcon }).addTo(leafMap);

                // Thêm nhãn tên vị trí khi di chuột vào (Ưu tiên mapTitle nếu có)
                marker.bindTooltip(scene.mapTitle || scene.title, {
                    direction: 'top',
                    offset: [0, -10],
                    className: 'custom-map-tooltip'
                });

                marker.on('click', (e) => {
                    if (krpanoObj) {
                        krpanoObj.call(`loadscene('${scene.id}', null, MERGE, BLEND(0.5))`);

                        // Tự động đóng bản đồ khi đã chọn xong địa điểm
                        const mapPanel = document.getElementById('map-panel');
                        const mapOverlay = document.getElementById('map-maximized-overlay');
                        const btnMaximize = document.getElementById('btn-maximize-map');

                        if (mapPanel) {
                            mapPanel.classList.add('collapsed');
                            mapPanel.classList.remove('maximized');
                        }
                        if (mapOverlay) mapOverlay.style.display = 'none';

                        // Cập nhật lại icon nút phóng to nếu cần
                        if (btnMaximize) {
                            btnMaximize.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>`;
                        }
                    }
                });

                mapMarkers.push({ id: scene.id, marker });
            }
        });
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
        
        // Auto-expand group containing current scene
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
