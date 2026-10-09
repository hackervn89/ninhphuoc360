/**
 * WebXR Bridge for Ninh Phước 360
 * ============================================================================
 * Trải nghiệm Thực tế ảo Immersive 360 độ (Full 360°) chuẩn W3C WebXR
 * Tối ưu hoá độ nét tối đa (Retina Crisp 10K Resolution) cho Meta Quest 3, Quest 2, Quest Pro và Pico 4.
 * Đồng bộ 100% với Web: Cảnh ban đầu, góc nhìn mặc định (hlookat/vlookat), Hotspot styles & scale.
 * Tích hợp Bảng Menu 3D Danh Sách Địa Điểm (Glassmorphism Web Style) tương tác trực tiếp trong VR & Simulator.
 * Dùng trực tiếp toàn bộ Icon Assets gốc của Tour Web: airport.png, iconlocation.png, icontructhang.png,
 * icon_pulse_dot.svg, icon_pulse_ring.svg, icon_pulse_line.svg, hotspot_pro.svg.
 * ============================================================================
 */

window.WebXRBridge = (function () {
    let manifest = null;
    let isInitialized = false;

    // Bộ nhớ cache cho các asset icon gốc của KrPano
    const HOTSPOT_ASSETS = {};
    let areAssetsLoaded = false;

    // Three.js Core Objects
    let renderer = null;
    let scene = null;
    let camera = null;
    let xrSession = null;

    // Hierarchy Groups
    let worldGroup = null;     // Chứa toàn bộ thế giới 360° (Cubemap Sky + Hotspots) để xoay theo hlookat
    let skyMesh = null;        // Khối cầu 360 độ mang shader texture cubemap
    let skyShaderMat = null;   // Vật liệu shader lấy mẫu từ CubeTexture
    let hotspotsGroup = null;  // Chứa tất cả Hotspot 3D
    let toastGroup = null;     // Nhãn thông báo tên cảnh
    let vrMenuGroup = null;    // Bảng Menu 3D danh sách địa điểm
    let vrMenuBtnMesh = null;  // Nút 3D mở menu nổi trong VR
    let vrMenuPanelMesh = null;// Mặt phẳng bảng menu 3D
    let fadeMesh = null;
    let raycaster = null;
    let controllers = [];
    let hoveredHotspot = null;

    // Gaze Cursor (Khi không dùng tay cầm)
    let gazeReticle = null;
    let gazeTarget = null;
    let gazeStartTime = 0;
    const GAZE_DWELL_TIME = 1400; // 1.4s

    // State Tracking
    let activeSceneId = '';
    let isTransitioning = false;
    let lastThumbstickTime = 0;
    let toastHideTimeout = null;
    let currentLoadingSceneToken = 0;

    // VR Menu 3D State
    let isMenuOpen = false;
    let selectedGroupIndex = 0;
    let menuPageIndex = 0;
    const SCENES_PER_PAGE = 8;
    let menuCanvas = null;
    let menuCtx = null;
    let menuTexture = null;
    let menuThumbCache = new Map();
    let menuClickTargets = []; // Danh sách vùng bấm trên bảng Menu { type, x, y, w, h, data }

    // ==========================================
    // CÁC BIẾN CHO BỘ GIẢ LẬP KÍNH VR (SIMULATOR)
    // ==========================================
    let isSimulator = false;
    let simOverlay = null;
    let simAnimId = null;
    let simCamLon = 0;
    let simCamLat = 0;
    let simIsPointerDown = false;
    let simPointerStart = { x: 0, y: 0 };
    let simPointerCurrent = { x: 0, y: 0 };
    let simPointerMoved = false;
    let simMouseNDC = new THREE.Vector2(-10, -10);
    let simAngleDisplay = null;
    let simSceneTitleDisplay = null;

    /**
     * Tải trước toàn bộ Asset Icon thực tế của bản Web
     */
    function preloadHotspotAssets() {
        if (areAssetsLoaded) return Promise.resolve();
        const assetList = [
            { key: 'airport', url: 'core/assets/airport.png' },
            { key: 'location', url: 'core/assets/iconlocation.png' },
            { key: 'helicopter', url: 'core/assets/icontructhang.png' },
            { key: 'pulse_dot', url: 'core/assets/icon_pulse_dot.svg' },
            { key: 'pulse_ring', url: 'core/assets/icon_pulse_ring.svg' },
            { key: 'pulse_line', url: 'core/assets/icon_pulse_line.svg' },
            { key: 'arrow_pro', url: 'engine/skin/hotspot_pro.svg' }
        ];

        return Promise.all(assetList.map(item => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    HOTSPOT_ASSETS[item.key] = img;
                    resolve();
                };
                img.onerror = () => {
                    console.warn('[WebXRBridge] Không thể nạp asset:', item.url);
                    resolve();
                };
                img.src = item.url;
            });
        })).then(() => {
            areAssetsLoaded = true;
            console.log('[WebXRBridge] Đã nạp đầy đủ các Hotspot Icon Assets gốc của Web.');
        });
    }

    /**
     * Nạp dữ liệu manifest đã trích xuất sẵn (Cảnh, Hotspot, Góc nhìn, Nhóm địa danh)
     */
    async function init() {
        if (isInitialized) return;
        try {
            await preloadHotspotAssets();
            const res = await fetch('core/data/vr-scenes-manifest.json?v=' + Date.now());
            if (res.ok) {
                manifest = await res.json();
                isInitialized = true;
                const sceneCount = Object.keys(manifest).filter(k => k !== '_meta').length;
                console.log(`[WebXRBridge] Đã nạp manifest cho ${sceneCount} cảnh và ${manifest._meta ? manifest._meta.groups.length : 0} nhóm địa điểm.`);
            }
        } catch (e) {
            console.warn('[WebXRBridge] Không thể nạp vr-scenes-manifest.json:', e);
        }
    }

    /**
     * Kiểm tra trình duyệt và thiết bị có hỗ trợ WebXR Immersive-VR không
     */
    async function isSupported() {
        if (!navigator.xr) return false;
        try {
            return await navigator.xr.isSessionSupported('immersive-vr');
        } catch (e) {
            return false;
        }
    }

    /**
     * Khởi tạo hệ thống 3D dùng chung cho cả VR thật và VR Simulator
     */
    function initSceneCommon() {
        scene = new THREE.Scene();
        raycaster = new THREE.Raycaster();

        // 1. worldGroup: xoay quanh trục Y theo -hlookat để đồng bộ góc nhìn mặc định như Web
        worldGroup = new THREE.Group();
        worldGroup.name = 'worldGroup';
        scene.add(worldGroup);

        // 2. skyMesh: Khối cầu 360 mang Shader đọc trực tiếp từ CubeTexture (chuẩn 10K)
        const skyGeo = new THREE.SphereGeometry(600, 60, 40);
        skyShaderMat = new THREE.ShaderMaterial({
            uniforms: {
                tCube: { value: null }
            },
            vertexShader: `
                varying vec3 vDirection;
                void main() {
                    vDirection = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform samplerCube tCube;
                varying vec3 vDirection;
                void main() {
                    vec3 dir = normalize(vDirection);
                    // Đọc CubeTexture với trục X lật ngược chuẩn quang học Three.js
                    gl_FragColor = textureCube(tCube, vec3(-dir.x, dir.y, dir.z));
                }
            `,
            side: THREE.BackSide,
            depthWrite: false
        });
        skyMesh = new THREE.Mesh(skyGeo, skyShaderMat);
        skyMesh.name = 'skyMesh';
        worldGroup.add(skyMesh);

        // 3. hotspotsGroup: Chứa các Hotspot điều hướng, nằm trong worldGroup để tự động xoay cùng bầu trời
        hotspotsGroup = new THREE.Group();
        hotspotsGroup.name = 'hotspotsGroup';
        worldGroup.add(hotspotsGroup);

        // 4. toastGroup: Thông báo tên cảnh nổi
        toastGroup = new THREE.Group();
        toastGroup.name = 'toastGroup';
        scene.add(toastGroup);

        // 5. vrMenuGroup: Menu 3D Danh Sách Địa Điểm
        vrMenuGroup = new THREE.Group();
        vrMenuGroup.name = 'vrMenuGroup';
        scene.add(vrMenuGroup);

        buildVRMenu3DComponents();

        // 6. Màn che chuyển cảnh mịn màng (Fade mesh)
        const fadeGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const fadeMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0,
            depthTest: false
        });
        fadeMesh = new THREE.Mesh(fadeGeo, fadeMat);
        fadeMesh.renderOrder = 9999;
    }

    /**
     * Bắt đầu phiên thực tế ảo Immersive VR trên kính thật (Meta Quest 3)
     */
    async function enterVR() {
        if (!navigator.xr) return false;
        if (!isInitialized) await init();
        if (typeof THREE === 'undefined') return false;

        if (isSimulator) {
            exitSimulator();
        }

        try {
            const session = await navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
            });

            xrSession = session;
            setupThreeJS(session);

            session.addEventListener('end', onSessionEnded);

            let sceneName = getInitialSceneName();

            await loadScene(sceneName, false);
            console.log('[WebXRBridge] Đã vào không gian thực tế ảo WebXR Full 360° (Native Retina Quest 3)!');
            return true;
        } catch (err) {
            console.error('[WebXRBridge] Lỗi khởi tạo WebXR Session:', err);
            return false;
        }
    }

    /**
     * Lấy cảnh bắt đầu chuẩn xác
     */
    function getInitialSceneName() {
        let sceneName = '';
        if (window.krpanoObj) {
            sceneName = window.krpanoObj.get('xml.scene') || '';
        }
        if (!sceneName && manifest && manifest._meta && manifest._meta.startScene) {
            sceneName = manifest._meta.startScene;
        }
        if (!sceneName && manifest) {
            const keys = Object.keys(manifest).filter(k => k !== '_meta');
            sceneName = keys[0] || '';
        }
        return sceneName;
    }

    /**
     * Cấu hình Three.js cho WebXR với độ phân giải siêu nét (Native Quest 3 Resolution)
     */
    function setupThreeJS(session) {
        initSceneCommon();

        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.add(fadeMesh);
        scene.add(camera);

        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('local-floor');

        if (renderer.xr.setFramebufferScaleFactor) {
            const nativeScale = (typeof XRWebGLLayer !== 'undefined' && XRWebGLLayer.getNativeFramebufferScaleFactor)
                ? XRWebGLLayer.getNativeFramebufferScaleFactor(session)
                : 1.5;
            renderer.xr.setFramebufferScaleFactor(nativeScale);
            console.log('[WebXRBridge] Đã kích hoạt Native Framebuffer Scale Factor:', nativeScale);
        }

        renderer.xr.setSession(session);

        if (session.renderState && session.renderState.baseLayer) {
            session.renderState.baseLayer.fixedFoveation = 0;
        }

        setupControllers();
        setupGazeReticle();

        renderer.setAnimationLoop(renderLoop);
    }

    /**
     * Đồng bộ tia raycast chính xác 100% từ toạ độ và hướng thế giới (World Space) của tay cầm
     */
    function setRaycasterFromController(controller) {
        if (!controller || !raycaster) return;
        if (scene) scene.updateMatrixWorld(true);
        controller.updateMatrixWorld(true);
        const rayOrigin = new THREE.Vector3();
        controller.getWorldPosition(rayOrigin);
        const rayDir = new THREE.Vector3(0, 0, -1);
        const controllerQuat = new THREE.Quaternion();
        controller.getWorldQuaternion(controllerQuat);
        rayDir.applyQuaternion(controllerQuat).normalize();
        raycaster.set(rayOrigin, rayDir);
    }

    let lastControllerSelectTime = 0;
    function handleControllerSelect(event) {
        const now = Date.now();
        if (now - lastControllerSelectTime < 200) return; // Debounce 200ms
        lastControllerSelectTime = now;
        onSelectStart(event);
    }

    /**
     * Cấu hình tia laser định vị cho tay cầm Meta Quest Touch
     */
    function setupControllers() {
        controllers = [];

        for (let i = 0; i < 2; i++) {
            const controller = renderer.xr.getController(i);
            controller.addEventListener('selectstart', handleControllerSelect);
            controller.addEventListener('select', handleControllerSelect);

            // 1. Thân tia laser 3D hình trụ màu đỏ nổi bật (không bị mờ, luôn hiển thị đè lên trên bảng menu)
            const laserGeo = new THREE.CylinderGeometry(0.003, 0.003, 1, 8);
            laserGeo.rotateX(-Math.PI / 2);
            laserGeo.translate(0, 0, -0.5); // Gốc tại tay cầm, kéo dài theo hướng -Z
            const laserMat = new THREE.MeshBasicMaterial({
                color: 0xef4444, // Màu đỏ tươi đồng bộ với nút Địa điểm
                transparent: true,
                opacity: 0.9,
                depthTest: false
            });
            const laser = new THREE.Mesh(laserGeo, laserMat);
            laser.name = 'laser';
            laser.renderOrder = 9998;
            laser.scale.set(1, 1, 6);
            controller.add(laser);

            // 2. Chấm con trỏ (Pointer Cursor) 2 tầng: Vòng ngoài đỏ + Tâm trong trắng sáng rực rỡ
            const dotGroup = new THREE.Group();
            dotGroup.name = 'dot';
            dotGroup.renderOrder = 9999;

            const dotOuterGeo = new THREE.SphereGeometry(0.02, 16, 16);
            const dotOuterMat = new THREE.MeshBasicMaterial({
                color: 0xef4444,
                transparent: true,
                opacity: 0.95,
                depthTest: false
            });
            const dotOuter = new THREE.Mesh(dotOuterGeo, dotOuterMat);
            dotOuter.renderOrder = 9999;
            dotGroup.add(dotOuter);

            const dotInnerGeo = new THREE.SphereGeometry(0.012, 16, 16);
            const dotInnerMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 1.0,
                depthTest: false
            });
            const dotInner = new THREE.Mesh(dotInnerGeo, dotInnerMat);
            dotInner.renderOrder = 10000;
            dotGroup.add(dotInner);

            dotGroup.position.z = -6;
            controller.add(dotGroup);

            scene.add(controller);
            controllers.push(controller);
        }
    }

    /**
     * Tâm ngắm Reticle (hỗ trợ khi không cầm tay cầm)
     */
    function setupGazeReticle() {
        const ringGeo = new THREE.RingGeometry(0.015, 0.025, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
            depthTest: false
        });
        gazeReticle = new THREE.Mesh(ringGeo, ringMat);
        gazeReticle.position.z = -2;
        gazeReticle.renderOrder = 999;
        camera.add(gazeReticle);
    }

    // ============================================================
    // BỘ GIẢ LẬP KÍNH VR TRÊN MÁY TÍNH (DESKTOP VR SIMULATOR)
    // ============================================================

    /**
     * Bắt đầu chế độ Mô phỏng Kính VR ngay trên Desktop
     */
    async function enterSimulator() {
        if (!manifest) await init();
        if (typeof THREE === 'undefined') return false;
        if (isSimulator) return true;

        isSimulator = true;
        initSceneCommon();

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 1.6, 0);
        camera.add(fadeMesh);
        scene.add(camera);

        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = false;

        simOverlay = document.createElement('div');
        simOverlay.id = 'vr-simulator-overlay';
        simOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 999999;
            background: #000;
            user-select: none;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        renderer.domElement.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            cursor: grab;
        `;
        simOverlay.appendChild(renderer.domElement);

        const header = document.createElement('div');
        header.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 24px;
            background: linear-gradient(180deg, rgba(5,12,28,0.95) 0%, rgba(5,12,28,0.6) 70%, transparent 100%);
            color: #fff;
            z-index: 10;
            pointer-events: none;
        `;
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 14px; pointer-events: auto;">
                <span style="font-size: 26px; filter: drop-shadow(0 0 10px #00f0ff);">🥽</span>
                <div>
                    <div style="font-weight: 800; font-size: 14px; letter-spacing: 0.5px; color: #00f0ff;">
                        CHẾ ĐỘ MÔ PHỎNG KÍNH VR (QUEST 3 SIMULATOR)
                    </div>
                    <div id="sim-scene-name" style="font-size: 12px; color: #ffb300; font-weight: 600; margin-top: 2px;">
                        Đang nạp cảnh...
                    </div>
                </div>
            </div>

            <div style="display: flex; align-items: center; gap: 12px; font-size: 12px; color: #e0e6ed; background: rgba(10,25,47,0.75); backdrop-filter: blur(10px); padding: 8px 18px; border-radius: 30px; border: 1px solid rgba(0,240,255,0.3); pointer-events: auto;">
                <span>🖱️ <b>Kéo chuột:</b> Quay đầu 360°</span>
                <span style="color: rgba(255,255,255,0.2);">|</span>
                <span>🎯 <b>Click:</b> Bấm Hotspot</span>
                <span style="color: rgba(255,255,255,0.2);">|</span>
                <button id="sim-btn-menu-toggle" style="background: linear-gradient(135deg, #00c6ff, #0072ff); color: #fff; border: none; padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 11px; cursor: pointer; box-shadow: 0 0 10px rgba(0,198,255,0.4);">
                    📍 Danh sách địa điểm (M)
                </button>
                <span style="color: rgba(255,255,255,0.2);">|</span>
                <span id="sim-angle-display" style="color: #00f0ff; font-family: monospace; font-size: 11px;">ath: 0° | atv: 0°</span>
            </div>

            <button id="sim-btn-close" style="pointer-events: auto; background: rgba(220, 38, 38, 0.9); color: #fff; border: 1px solid rgba(255,255,255,0.2); padding: 8px 18px; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 14px rgba(220,38,38,0.4);">
                ✕ Thoát giả lập (ESC)
            </button>
        `;
        simOverlay.appendChild(header);

        simSceneTitleDisplay = header.querySelector('#sim-scene-name');
        simAngleDisplay = header.querySelector('#sim-angle-display');
        header.querySelector('#sim-btn-close').addEventListener('click', exitSimulator);
        header.querySelector('#sim-btn-menu-toggle').addEventListener('click', () => toggleVRMenu());

        document.body.appendChild(simOverlay);

        simCamLon = 0;
        simCamLat = 0;
        updateSimCameraLook();

        bindSimEvents();

        let sceneName = getInitialSceneName();
        await loadScene(sceneName, false);

        simRenderLoop();
        console.log('[WebXRBridge] Đã mở bộ giả lập kính VR trên máy tính.');
        return true;
    }

    /**
     * Cập nhật hướng nhìn của camera giả lập
     */
    function updateSimCameraLook() {
        const radLon = THREE.MathUtils.degToRad(simCamLon);
        const radLat = THREE.MathUtils.degToRad(simCamLat);
        const cosLat = Math.cos(radLat);
        const lookDir = new THREE.Vector3(
            cosLat * Math.sin(radLon),
            Math.sin(radLat),
            -cosLat * Math.cos(radLon)
        );
        camera.lookAt(camera.position.clone().add(lookDir));

        if (simAngleDisplay) {
            let normAth = ((simCamLon % 360) + 540) % 360 - 180;
            let normAtv = -simCamLat;
            simAngleDisplay.textContent = `ath: ${normAth.toFixed(1)}° | atv: ${normAtv.toFixed(1)}°`;
        }
    }

    function bindSimEvents() {
        const dom = renderer.domElement;
        dom.addEventListener('mousedown', onSimMouseDown);
        window.addEventListener('mousemove', onSimMouseMove);
        window.addEventListener('mouseup', onSimMouseUp);
        window.addEventListener('keydown', onSimKeyDown);
        window.addEventListener('resize', onSimResize);
    }

    function unbindSimEvents() {
        if (renderer && renderer.domElement) {
            renderer.domElement.removeEventListener('mousedown', onSimMouseDown);
        }
        window.removeEventListener('mousemove', onSimMouseMove);
        window.removeEventListener('mouseup', onSimMouseUp);
        window.removeEventListener('keydown', onSimKeyDown);
        window.removeEventListener('resize', onSimResize);
    }

    function onSimMouseDown(e) {
        if (e.button !== 0) return;
        simIsPointerDown = true;
        simPointerMoved = false;
        simPointerStart.x = e.clientX;
        simPointerStart.y = e.clientY;
        simPointerCurrent.x = e.clientX;
        simPointerCurrent.y = e.clientY;
        if (renderer && renderer.domElement) {
            renderer.domElement.style.cursor = 'grabbing';
        }
    }

    function onSimMouseMove(e) {
        simMouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
        simMouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

        if (simIsPointerDown) {
            const dx = e.clientX - simPointerCurrent.x;
            const dy = e.clientY - simPointerCurrent.y;
            simPointerCurrent.x = e.clientX;
            simPointerCurrent.y = e.clientY;

            if (Math.hypot(e.clientX - simPointerStart.x, e.clientY - simPointerStart.y) > 5) {
                simPointerMoved = true;
            }

            simCamLon -= dx * 0.16;
            simCamLat += dy * 0.16;
            simCamLat = Math.max(-85, Math.min(85, simCamLat));
            updateSimCameraLook();
        } else {
            checkSimHover();
        }
    }

    function onSimMouseUp(e) {
        if (!simIsPointerDown) return;
        simIsPointerDown = false;

        if (!simPointerMoved) {
            triggerSimClick(e);
        }

        if (renderer && renderer.domElement) {
            renderer.domElement.style.cursor = hoveredHotspot ? 'pointer' : 'grab';
        }
    }

    function checkSimHover() {
        if (!camera || !raycaster) return;
        camera.updateMatrixWorld();
        raycaster.setFromCamera(simMouseNDC, camera);

        // 1. Kiểm tra Bảng Menu 3D nếu đang mở
        if (isMenuOpen && vrMenuPanelMesh && vrMenuPanelMesh.visible) {
            const menuHits = raycaster.intersectObject(vrMenuPanelMesh, false);
            if (menuHits.length > 0) {
                if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'pointer';
                return;
            }
        }

        // 2. Kiểm tra Nút mở Menu 3D
        if (vrMenuBtnMesh && vrMenuBtnMesh.visible) {
            const btnHits = raycaster.intersectObject(vrMenuBtnMesh, true);
            if (btnHits.length > 0) {
                if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'pointer';
                return;
            }
        }

        // 3. Kiểm tra Hotspots trong cảnh
        if (hotspotsGroup) {
            const hits = raycaster.intersectObjects(hotspotsGroup.children, true);
            if (hits.length > 0) {
                let hit = hits[0].object;
                while (hit && !hit.userData.isHotspot && hit.parent) {
                    hit = hit.parent;
                }
                if (hit) {
                    hoveredHotspot = hit;
                    if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'pointer';
                    return;
                }
            }
        }

        hoveredHotspot = null;
        if (renderer && renderer.domElement && !simIsPointerDown) {
            renderer.domElement.style.cursor = 'grab';
        }
    }

    function triggerSimClick(e) {
        simMouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
        simMouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
        if (camera) camera.updateMatrixWorld();
        raycaster.setFromCamera(simMouseNDC, camera);

        // 1. Nếu Menu đang mở: xử lý tương tác trên Bảng Menu 3D
        if (isMenuOpen && vrMenuPanelMesh && vrMenuPanelMesh.visible) {
            const menuHits = raycaster.intersectObject(vrMenuPanelMesh, false);
            if (menuHits.length > 0) {
                handleMenuPanelClick(menuHits[0].uv);
                return;
            }
        }

        // 2. Nếu bấm vào Nút 3D mở Menu
        if (vrMenuBtnMesh && vrMenuBtnMesh.visible) {
            const btnHits = raycaster.intersectObject(vrMenuBtnMesh, true);
            if (btnHits.length > 0) {
                toggleVRMenu();
                return;
            }
        }

        // 3. Nếu bấm vào Hotspot chuyển cảnh
        if (hotspotsGroup) {
            const hits = raycaster.intersectObjects(hotspotsGroup.children, true);
            if (hits.length > 0) {
                let hit = hits[0].object;
                while (hit && !hit.userData.isHotspot && hit.parent) {
                    hit = hit.parent;
                }
                if (hit && hit.userData && hit.userData.linkedscene) {
                    switchScene(hit.userData.linkedscene);
                }
            }
        }
    }

    function onSimKeyDown(e) {
        if (!isSimulator) return;
        if (e.key === 'Escape') {
            if (isMenuOpen) {
                toggleVRMenu(false);
            } else {
                exitSimulator();
            }
        } else if (e.key === 'm' || e.key === 'M') {
            toggleVRMenu();
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            navigateRelativeScene(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            navigateRelativeScene(-1);
        }
    }

    function onSimResize() {
        if (!isSimulator || !camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function simRenderLoop(timestamp) {
        if (!isSimulator) return;
        simAnimId = requestAnimationFrame(simRenderLoop);
        updateFade();

        const time = timestamp || performance.now();

        if (skyMesh && camera) {
            skyMesh.position.copy(camera.position);
        }

        updateVRMenuFloatingPositions();

        // Xoay Hotspots hướng về camera (Billboard) và nhấp nhô lơ lửng
        if (hotspotsGroup) {
            hotspotsGroup.children.forEach(hs => {
                hs.lookAt(camera.position);

                if (hs.userData && hs.userData.baseY !== undefined) {
                    if (hs.userData.style === 'trenkhong' || hs.userData.style === 'vitri') {
                        hs.position.y = hs.userData.baseY + 0.08 * Math.sin(time * 0.003 + (hs.userData.pulseOffset || 0));
                    }
                }

                const pulse = 1 + 0.025 * Math.sin(time * 0.004 + (hs.userData.pulseOffset || 0));
                const targetScale = (hs === hoveredHotspot ? 1.15 : pulse);
                hs.scale.set(targetScale, targetScale, 1);
            });
        }

        renderer.render(scene, camera);
    }

    function exitSimulator() {
        if (!isSimulator) return;
        isSimulator = false;

        if (simAnimId) {
            cancelAnimationFrame(simAnimId);
            simAnimId = null;
        }

        unbindSimEvents();

        if (simOverlay && simOverlay.parentNode) {
            simOverlay.parentNode.removeChild(simOverlay);
            simOverlay = null;
        }

        if (renderer) {
            renderer.dispose();
            renderer = null;
        }
        scene = null;
        camera = null;
        worldGroup = null;
        skyMesh = null;
        skyShaderMat = null;
        hotspotsGroup = null;
        toastGroup = null;
        vrMenuGroup = null;
        vrMenuBtnMesh = null;
        vrMenuPanelMesh = null;
        fadeMesh = null;
        hoveredHotspot = null;
        simAngleDisplay = null;
        simSceneTitleDisplay = null;
        isMenuOpen = false;

        console.log('[WebXRBridge] Đã đóng bộ giả lập VR.');
    }

    // ============================================================
    // CÁC HÀM XỬ LÝ CẢNH, CUBEMAP VÀ GÓC NHÌN ĐỒNG BỘ 100%
    // ============================================================

    /**
     * Nạp cảnh 360 độ và tạo các Hotspot tương ứng
     */
    async function loadScene(sceneId, useFade = true) {
        if (!manifest || !manifest[sceneId]) {
            console.warn('[WebXRBridge] Không tìm thấy dữ liệu scene:', sceneId);
            return;
        }

        activeSceneId = sceneId;
        const sceneData = manifest[sceneId];

        if (simSceneTitleDisplay) {
            simSceneTitleDisplay.textContent = '📍 ' + (sceneData.title || sceneId);
        }

        // 1. Đồng bộ góc nhìn mặc định: Chuẩn hóa hlookat và vlookat
        let rawH = sceneData.hlookat !== undefined ? parseFloat(sceneData.hlookat) : 0;
        let rawV = sceneData.vlookat !== undefined ? parseFloat(sceneData.vlookat) : 0;

        let normH = ((rawH % 360) + 360) % 360;
        if (normH > 180) normH -= 360; // Chuẩn hóa về [-180, 180]

        if (worldGroup) {
            worldGroup.rotation.y = THREE.MathUtils.degToRad(normH);
        }

        // Trong simulator: camera nhìn thẳng vào hướng mặc định
        if (isSimulator) {
            simCamLon = 0;
            simCamLat = -Math.max(-85, Math.min(85, rawV));
            updateSimCameraLook();
        }

        if (!areAssetsLoaded) {
            try {
                await preloadHotspotAssets();
            } catch (eAsset) {
                console.warn('[WebXRBridge] Lỗi nạp asset icon:', eAsset);
            }
        }

        if (useFade && fadeMesh) {
            await tweenFade(0, 1, 150);
        }

        // 2. Tầng 1: Nạp ảnh Preview cực nhanh
        try {
            await loadPreviewCubemap(sceneData.preview);
        } catch (e) {
            console.error('[WebXRBridge] Lỗi khi nạp preview cubemap:', e);
        }

        // 3. Hiển thị nhãn thông báo tên cảnh
        showSceneToast(sceneData.title || sceneId);

        // 4. Tạo các Hotspot 3D sống động theo đúng style bản Web và kích thước chuẩn
        createSceneHotspots(sceneData.hotspots || []);

        if (useFade && fadeMesh) {
            await tweenFade(1, 0, 200);
        }

        if (isMenuOpen) {
            renderMenuCanvas();
        }

        // 5. Tầng 2 & 3: Tự động nâng cấp lên Level 2 (5K) rồi lên Level 3 (10K Retina siêu nét nguyên gốc)
        if (sceneData.tilesDir) {
            loadHighResTiles(sceneData.tilesDir, sceneId);
        }
    }

    /**
     * Xoay canvas 180 độ quanh tâm (Khắc phục triệt để hiện tượng lệch mảng bầu trời u và mặt đất d)
     */
    function rotateCanvas180(sourceCanvas) {
        const c = document.createElement('canvas');
        c.width = sourceCanvas.width;
        c.height = sourceCanvas.height;
        const ctx = c.getContext('2d');
        ctx.translate(c.width, c.height);
        ctx.rotate(Math.PI);
        ctx.drawImage(sourceCanvas, 0, 0);
        return c;
    }

    /**
     * Cắt ảnh preview.jpg thành 6 mặt CubeTexture theo đúng toạ độ quang học (có sửa xoay u và d)
     */
    function loadPreviewCubemap(previewUrl) {
        return new Promise((resolve) => {
            let isResolved = false;
            const finish = () => {
                if (!isResolved) {
                    isResolved = true;
                    resolve();
                }
            };
            const timer = setTimeout(finish, 3500); // Tối đa 3.5s để không bao giờ nghẽn

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                clearTimeout(timer);
                try {
                    const faceSize = img.width; // 256
                    const stripOrder = ['l', 'f', 'r', 'b', 'u', 'd'];
                    const faceCanvases = {};

                    for (let i = 0; i < 6; i++) {
                        const c = document.createElement('canvas');
                        c.width = faceSize;
                        c.height = faceSize;
                        const ctx = c.getContext('2d');
                        ctx.drawImage(img, 0, i * faceSize, faceSize, faceSize, 0, 0, faceSize, faceSize);
                        faceCanvases[stripOrder[i]] = c;
                    }

                    const uCanvas = rotateCanvas180(faceCanvases.u);
                    const dCanvas = rotateCanvas180(faceCanvases.d);

                    const cubeTex = new THREE.CubeTexture([
                        faceCanvases.l,
                        faceCanvases.r,
                        uCanvas,
                        dCanvas,
                        faceCanvases.b,
                        faceCanvases.f
                    ]);
                    cubeTex.needsUpdate = true;
                    applyCubeTextureToSky(cubeTex);
                } catch (e) {
                    console.warn('[WebXRBridge] Lỗi parse preview:', e);
                }
                finish();
            };
            img.onerror = () => {
                clearTimeout(timer);
                console.warn('[WebXRBridge] Không tải được preview:', previewUrl);
                finish();
            };
            img.src = previewUrl;
        });
    }

    /**
     * Nạp và ghép ảnh Cubemap đa phân giải: Level 2 (5K) tức thì -> Level 3 (10K siêu nét nguyên gốc)
     * Tự động nhận diện cấu trúc ảnh gạch: 1280/2560 (cảnh mặt đất) và 1536/3072 (cảnh trên cao 300m & 100m)
     */
    async function loadHighResTiles(tilesDir, sceneId) {
        const token = ++currentLoadingSceneToken;

        // BƯỚC 1: Nạp nhanh Level 2 để nâng độ nét lên tức thì
        try {
            const l2Canvases = await loadLevelTiles(tilesDir, 2, sceneId);
            if (token !== currentLoadingSceneToken) return;

            if (l2Canvases) {
                applyCubeTextureToSky(createCubeTextureFromCanvases(l2Canvases));
                console.log('[WebXRBridge] Đã áp dụng Level 2 cho cảnh:', sceneId);
            }
        } catch (e2) {
            console.warn('[WebXRBridge] Bỏ qua L2:', e2);
        }

        // BƯỚC 2: Tự động nâng cấp tiếp lên Level 3 (Chuẩn Retina 10K sắc nét nguyên bản)
        try {
            const l3Canvases = await loadLevelTiles(tilesDir, 3, sceneId);
            if (token !== currentLoadingSceneToken) return;

            if (l3Canvases) {
                applyCubeTextureToSky(createCubeTextureFromCanvases(l3Canvases));
                console.log('[WebXRBridge] ĐÃ NÂNG CẤP ĐẠT ĐỈNH LEVEL 3 (Retina 10K) cho cảnh:', sceneId);
            }
        } catch (e3) {
            console.log('[WebXRBridge] Giữ nguyên Level 2 cho:', sceneId);
        }
    }

    /**
     * Nạp các mảnh tile cho từng Level dựa trên kích thước thật của cảnh:
     * - Cảnh thông thường: Level 2 = 1280x1280 (3x3), Level 3 = 2560x2560 (5x5)
     * - Cảnh toàn cảnh 300m/100m: Level 2 = 1536x1536 (3x3), Level 3 = 3072x3072 (6x6)
     */
    async function loadLevelTiles(tilesDir, level, sceneId) {
        const faces = ['l', 'r', 'u', 'd', 'b', 'f'];
        const sceneData = (manifest && sceneId && manifest[sceneId]) ? manifest[sceneId] : null;
        const levels = sceneData && sceneData.levels ? sceneData.levels : null;

        // Xác định kích thước chuẩn xác của từng mặt (px)
        let targetDim = 0;
        if (levels && levels['l' + level]) {
            targetDim = levels['l' + level];
        } else if (tilesDir && (tilesDir.includes('toancanh_300m') || tilesDir.includes('toancanh_100m'))) {
            targetDim = level === 3 ? 3072 : (level === 2 ? 1536 : 768);
        } else {
            targetDim = level === 3 ? 2560 : (level === 2 ? 1280 : 640);
        }

        const numTiles = Math.ceil(targetDim / 512);

        const facePromises = faces.map(async (face) => {
            const canvas = document.createElement('canvas');
            canvas.width = targetDim;
            canvas.height = targetDim;
            const ctx = canvas.getContext('2d');

            const tilePositions = [];
            for (let r = 1; r <= numTiles; r++) {
                for (let c = 1; c <= numTiles; c++) {
                    const rStr = String(r).padStart(2, '0');
                    const cStr = String(c).padStart(2, '0');
                    tilePositions.push({
                        r: rStr,
                        c: cStr,
                        x: (c - 1) * 512,
                        y: (r - 1) * 512,
                        url: `${tilesDir}/${face}/l${level}/${rStr}/l${level}_${face}_${rStr}_${cStr}.jpg`
                    });
                }
            }

            const tileImgs = await Promise.all(
                tilePositions.map(pos => loadImage(pos.url))
            );

            tilePositions.forEach((pos, idx) => {
                ctx.drawImage(tileImgs[idx], pos.x, pos.y);
            });

            if (face === 'u' || face === 'd') {
                return rotateCanvas180(canvas);
            }
            return canvas;
        });

        return await Promise.all(facePromises);
    }

    function createCubeTextureFromCanvases(faceCanvases) {
        const cubeTex = new THREE.CubeTexture(faceCanvases);
        cubeTex.generateMipmaps = true;
        cubeTex.minFilter = THREE.LinearMipmapLinearFilter;
        cubeTex.magFilter = THREE.LinearFilter;
        cubeTex.wrapS = THREE.ClampToEdgeWrapping;
        cubeTex.wrapT = THREE.ClampToEdgeWrapping;
        if (renderer && renderer.capabilities) {
            cubeTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        cubeTex.needsUpdate = true;
        return cubeTex;
    }

    function applyCubeTextureToSky(cubeTex) {
        if (skyShaderMat && skyShaderMat.uniforms && skyShaderMat.uniforms.tCube) {
            skyShaderMat.uniforms.tCube.value = cubeTex;
        }
    }

    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Không thể nạp: ' + url));
            img.src = url;
        });
    }

    // ============================================================
    // HỆ THỐNG HOTSPOTS 3D ĐỒNG BỘ 100% STYLE VÀ ASSETS TỪ BẢN WEB
    // ============================================================

    /**
     * Tạo các Hotspot 3D sống động từ danh sách đã trích xuất của cảnh
     */
    function createSceneHotspots(hotspotsList) {
        hotspotsGroup.clear();

        hotspotsList.forEach(hs => {
            const mesh = createHotspotBillboard(
                hs.ath,
                hs.atv,
                hs.linkedscene,
                hs.title,
                hs.style,
                hs.scale
            );
            if (mesh) {
                hotspotsGroup.add(mesh);
            }
        });
    }

    /**
     * Tạo một Hotspot 3D Billboard luôn hướng mặt về phía người dùng
     * Sử dụng đúng Asset Icon và kích thước chuẩn nhìn rõ (không bị co nhỏ)
     */
    function createHotspotBillboard(ath, atv, linkedscene, title, style, scale) {
        const R = 8.0;
        const radAth = ath * (Math.PI / 180);
        const radAtv = atv * (Math.PI / 180);

        const r_h = R * Math.cos(radAtv);
        const x = r_h * Math.sin(radAth);
        const z = -r_h * Math.cos(radAth);
        const y = 1.6 - R * Math.sin(radAtv);

        let mesh = null;
        const isPulseDot = (style === 'pulse_dot');

        if (isPulseDot) {
            // ========================================================
            // 1. STYLE: pulse_dot (Chấm tròn Callout chuyên dụng cảnh trên cao 300m và 100m)
            // Chuẩn 100% bản Web: Chấm trắng + Vòng đỏ + Line chéo + Hộp đỏ viền trắng in hoa
            // ========================================================
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 420;
            const ctx = canvas.getContext('2d');

            drawPulseDotHotspotCanvas(ctx, title);

            const texture = new THREE.CanvasTexture(canvas);
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;

            // Kích thước chuẩn trong 3D: rộng 3.2m, cao 1.3125m ở cự ly 8m (nhìn rõ tuyệt đối)
            const geo = new THREE.PlaneGeometry(3.2, 1.3125);
            // Dịch chuyển tâm để Chân chấm tròn (180, 320) cắm CHÍNH XÁC tại toạ độ thực địa (x, y, z)
            geo.translate(1.0375, 0.34375, 0);

            const mat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide,
                depthTest: false
            });

            mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            mesh.renderOrder = 100;

            mesh.userData = {
                isHotspot: true,
                linkedscene: linkedscene,
                title: title,
                style: style,
                baseY: y,
                baseScale: 1.0,
                pulseOffset: Math.random() * Math.PI * 2
            };

        } else if (style === 'trenkhong') {
            // ========================================================
            // 2. STYLE: trenkhong (Góc nhìn toàn cảnh trên cao - dùng icon máy bay airport.png)
            // ========================================================
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');

            drawStandardHotspotCanvas(ctx, title, style);

            const texture = new THREE.CanvasTexture(canvas);
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;

            const geo = new THREE.PlaneGeometry(2.2, 2.2);
            geo.translate(0, 0.2, 0);

            const mat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide,
                depthTest: false
            });

            mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            mesh.renderOrder = 100;

            mesh.userData = {
                isHotspot: true,
                linkedscene: linkedscene,
                title: title,
                style: style,
                baseY: y,
                baseScale: 1.0,
                pulseOffset: Math.random() * Math.PI * 2
            };

        } else if (style === 'vitri') {
            // ========================================================
            // 3. STYLE: vitri (Ghim đỏ chuẩn bản Web - dùng iconlocation.png)
            // ========================================================
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');

            drawStandardHotspotCanvas(ctx, title, style);

            const texture = new THREE.CanvasTexture(canvas);
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;

            const geo = new THREE.PlaneGeometry(2.0, 2.0);
            geo.translate(0, 0.3, 0);

            const mat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide,
                depthTest: false
            });

            mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            mesh.renderOrder = 100;

            mesh.userData = {
                isHotspot: true,
                linkedscene: linkedscene,
                title: title,
                style: style,
                baseY: y,
                baseScale: 1.0,
                pulseOffset: Math.random() * Math.PI * 2
            };

        } else {
            // ========================================================
            // 4. CÁC STYLE KHÁC: tructhang, muiten
            // ========================================================
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');

            drawStandardHotspotCanvas(ctx, title, style);

            const texture = new THREE.CanvasTexture(canvas);
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;

            const geo = new THREE.PlaneGeometry(1.9, 1.9);
            const mat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide,
                depthTest: false
            });

            mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            mesh.renderOrder = 100;

            mesh.userData = {
                isHotspot: true,
                linkedscene: linkedscene,
                title: title,
                style: style,
                baseY: y,
                baseScale: 1.0,
                pulseOffset: Math.random() * Math.PI * 2
            };
        }

        return mesh;
    }

    /**
     * Vẽ Hotspot kiểu pulse_dot (Chấm tròn + Vòng đỏ + Đường nối Callout + Hộp chữ đỏ viền trắng)
     * Đồng bộ chuẩn 100% với tour.xml (pulse_dot_setup / pulse_dot_label)
     */
    function drawPulseDotHotspotCanvas(ctx, title) {
        ctx.clearRect(0, 0, 1024, 420);

        const cx = 180;
        const cy = 320;

        // 1. Vòng tròn xung nhịp đỏ ngoài (Chuẩn như vòng pulse trên Web)
        if (HOTSPOT_ASSETS.pulse_ring && HOTSPOT_ASSETS.pulse_ring.complete && HOTSPOT_ASSETS.pulse_ring.naturalWidth > 0) {
            ctx.drawImage(HOTSPOT_ASSETS.pulse_ring, cx - 48, cy - 48, 96, 96);
        } else {
            ctx.save();
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 6;
            ctx.shadowColor = 'rgba(220, 38, 38, 0.8)';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(cx, cy, 38, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 2. Chấm tròn trắng tinh khôi ở tâm (Chuẩn icon_pulse_dot.svg trên Web)
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 3. Đường dẫn chéo Callout Line (Màu trắng nét đậm 6.5px, chuẩn icon_pulse_line.svg)
        const p1x = cx;
        const p1y = cy;
        const p2x = cx + 85;
        const p2y = cy - 130;
        const p3x = cx + 150;
        const p3y = cy - 130;

        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p2x, p2y);
        ctx.lineTo(p3x, p3y);
        ctx.stroke();
        ctx.restore();

        // 4. Hộp thông tin Callout Badge: Đỏ tươi #dc2626 viền trắng #ffffff bóng đổ đen
        // Chuẩn 100% style pulse_dot_label trong tour.xml
        const displayTitle = (title || 'Địa điểm').toUpperCase();
        ctx.font = 'bold 23px "Roboto", "Segoe UI", Arial, sans-serif';
        const textMetrics = ctx.measureText(displayTitle);
        const boxPaddingX = 22;
        const boxW = Math.max(160, textMetrics.width + boxPaddingX * 2);
        const boxH = 54;
        const boxX = p3x;
        const boxY = p3y - boxH / 2;

        ctx.save();
        // Bóng đổ hộp sang trọng
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;

        // Nền đỏ #dc2626 viền trắng 2.5px
        ctx.fillStyle = '#dc2626';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        roundRect(ctx, boxX, boxY, boxW, boxH, 6);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.stroke();

        // Chữ in hoa màu trắng sáng
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayTitle, boxX + boxW / 2, boxY + boxH / 2 + 1);
        ctx.restore();
    }

    /**
     * Vẽ Hotspot tiêu chuẩn (trenkhong, tructhang, vitri, muiten) dùng icon asset thật của Web
     */
    function drawStandardHotspotCanvas(ctx, title, style) {
        ctx.clearRect(0, 0, 512, 512);

        const cx = 256;
        const cy = 180;

        if (style === 'trenkhong') {
            // ============================================
            // STYLE: trenkhong (Góc nhìn toàn cảnh trên cao - dùng icon máy bay airport.png)
            // ============================================
            const gradGlow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 95);
            gradGlow.addColorStop(0, 'rgba(255, 179, 0, 0.6)');
            gradGlow.addColorStop(0.5, 'rgba(255, 179, 0, 0.2)');
            gradGlow.addColorStop(1, 'rgba(255, 179, 0, 0)');
            ctx.fillStyle = gradGlow;
            ctx.beginPath();
            ctx.arc(cx, cy, 95, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(10, 25, 47, 0.9)';
            ctx.strokeStyle = '#ffb300';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(cx, cy, 64, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (HOTSPOT_ASSETS.airport && HOTSPOT_ASSETS.airport.complete && HOTSPOT_ASSETS.airport.naturalWidth > 0) {
                ctx.drawImage(HOTSPOT_ASSETS.airport, cx - 44, cy - 44, 88, 88);
            } else {
                ctx.fillStyle = '#ffb300';
                ctx.font = 'bold 44px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('✈', cx, cy);
            }

            drawHotspotTitleBadge(ctx, cx, cy, title, '#ffb300');

        } else if (style === 'tructhang') {
            // ============================================
            // STYLE: tructhang (Trực thăng bay lên - dùng icontructhang.png)
            // ============================================
            ctx.fillStyle = 'rgba(10, 25, 47, 0.9)';
            ctx.strokeStyle = '#ffb300';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(cx, cy, 64, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (HOTSPOT_ASSETS.helicopter && HOTSPOT_ASSETS.helicopter.complete && HOTSPOT_ASSETS.helicopter.naturalWidth > 0) {
                ctx.drawImage(HOTSPOT_ASSETS.helicopter, cx - 48, cy - 35, 96, 70);
            } else {
                ctx.fillStyle = '#ffb300';
                ctx.font = 'bold 40px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🚁', cx, cy);
            }

            drawHotspotTitleBadge(ctx, cx, cy, title, '#ffb300');

        } else if (style === 'vitri') {
            // ============================================
            // STYLE: vitri (Ghim đỏ chuẩn bản Web - dùng iconlocation.png)
            // ============================================
            const gradGlow = ctx.createRadialGradient(cx, cy - 10, 20, cx, cy - 10, 95);
            gradGlow.addColorStop(0, 'rgba(220, 38, 38, 0.65)');
            gradGlow.addColorStop(0.5, 'rgba(220, 38, 38, 0.2)');
            gradGlow.addColorStop(1, 'rgba(220, 38, 38, 0)');
            ctx.fillStyle = gradGlow;
            ctx.beginPath();
            ctx.arc(cx, cy - 10, 95, 0, Math.PI * 2);
            ctx.fill();

            if (HOTSPOT_ASSETS.location && HOTSPOT_ASSETS.location.complete && HOTSPOT_ASSETS.location.naturalWidth > 0) {
                ctx.drawImage(HOTSPOT_ASSETS.location, cx - 40, cy - 65, 80, 105);
            } else {
                ctx.fillStyle = '#dc2626';
                ctx.font = 'bold 50px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('📍', cx, cy - 15);
            }

            drawHotspotTitleBadge(ctx, cx, cy, title, '#dc2626');

        } else {
            // ============================================
            // STYLE: muiten hoặc mặc định (Mũi tên đỏ gradient chuẩn hotspot_pro.svg)
            // ============================================
            const gradGlow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 90);
            gradGlow.addColorStop(0, 'rgba(237, 47, 90, 0.65)');
            gradGlow.addColorStop(0.5, 'rgba(237, 47, 90, 0.2)');
            gradGlow.addColorStop(1, 'rgba(237, 47, 90, 0)');
            ctx.fillStyle = gradGlow;
            ctx.beginPath();
            ctx.arc(cx, cy, 90, 0, Math.PI * 2);
            ctx.fill();

            // Vòng tròn trung tâm
            ctx.fillStyle = 'rgba(10, 25, 47, 0.92)';
            ctx.strokeStyle = '#ed2f5a';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(cx, cy, 55, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Mũi tên Chevron đỏ Panoee
            ctx.fillStyle = '#ed2f5a';
            ctx.beginPath();
            ctx.moveTo(cx, cy - 25);
            ctx.lineTo(cx + 25, cy + 5);
            ctx.lineTo(cx + 14, cy + 18);
            ctx.lineTo(cx, cy + 4);
            ctx.lineTo(cx - 14, cy + 18);
            ctx.lineTo(cx - 25, cy + 5);
            ctx.closePath();
            ctx.fill();

            drawHotspotTitleBadge(ctx, cx, cy, title, '#ed2f5a');
        }
    }

    function drawHotspotTitleBadge(ctx, cx, cy, title, borderColor) {
        if (!title) return;
        const displayTitle = title.toUpperCase();
        ctx.font = 'bold 23px "Roboto", "Segoe UI", Arial, sans-serif';
        const textMetrics = ctx.measureText(displayTitle);
        const badgeW = Math.min(480, Math.max(160, textMetrics.width + 48));
        const badgeH = 56;
        const badgeX = cx - badgeW / 2;
        const badgeY = cy + 76;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;

        ctx.fillStyle = 'rgba(10, 25, 47, 0.95)';
        ctx.strokeStyle = borderColor || '#00f0ff';
        ctx.lineWidth = 3;
        roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 10);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayTitle, cx, badgeY + badgeH / 2 + 1);
        ctx.restore();
    }

    /**
     * Bảng tên cảnh nổi trên cao, tự ẩn sau 3.5s
     */
    function showSceneToast(title) {
        toastGroup.clear();
        if (toastHideTimeout) clearTimeout(toastHideTimeout);

        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(5, 12, 28, 0.88)';
        ctx.strokeStyle = 'rgba(255, 179, 0, 0.85)';
        ctx.lineWidth = 6;
        roundRect(ctx, 8, 8, 784, 144, 30);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffb300';
        ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📍 ' + title, 400, 80);

        const texture = new THREE.CanvasTexture(canvas);
        const geo = new THREE.PlaneGeometry(2.0, 0.4);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0,
            depthTest: false
        });

        const mesh = new THREE.Mesh(geo, mat);

        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        if (camDir.lengthSq() < 0.001) camDir.set(0, 0, -1);
        camDir.normalize();

        mesh.position.copy(camera.position).add(camDir.multiplyScalar(3.5));
        mesh.position.y += 0.6;
        mesh.lookAt(camera.position);
        mesh.renderOrder = 200;
        toastGroup.add(mesh);

        toastHideTimeout = setTimeout(() => {
            let op = 1.0;
            const fadeInterval = setInterval(() => {
                op -= 0.05;
                if (op <= 0) {
                    clearInterval(fadeInterval);
                    toastGroup.clear();
                } else {
                    mat.opacity = op;
                }
            }, 30);
        }, 3500);
    }

    // ============================================================
    // MENU 3D DANH SÁCH ĐỊA ĐIỂM (VR 3D LOCATIONS PANEL)
    // ============================================================

    function buildVRMenu3DComponents() {
        vrMenuGroup.clear();

        // Nút 3D mở Menu nhỏ gọn: Nền trắng glass, viền đỏ sang trọng
        const btnCanvas = document.createElement('canvas');
        btnCanvas.width = 380;
        btnCanvas.height = 120;
        const bCtx = btnCanvas.getContext('2d');

        // Nền trắng glass mờ cao cấp
        bCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        bCtx.strokeStyle = '#ef4444'; // Viền đỏ nổi bật
        bCtx.lineWidth = 6;
        roundRect(bCtx, 6, 6, 368, 108, 28);
        bCtx.fill();
        bCtx.stroke();

        // Chữ ĐỊA ĐIỂM màu đỏ đậm sắc nét trên nền trắng
        bCtx.fillStyle = '#dc2626';
        bCtx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        bCtx.fillText('📍 ĐỊA ĐIỂM', 190, 60);

        const btnTex = new THREE.CanvasTexture(btnCanvas);
        const btnMat = new THREE.MeshBasicMaterial({
            map: btnTex,
            transparent: true,
            depthTest: false
        });
        vrMenuBtnMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.108), btnMat);
        vrMenuBtnMesh.name = 'vrMenuBtnMesh';
        vrMenuBtnMesh.renderOrder = 999;
        vrMenuGroup.add(vrMenuBtnMesh);

        // Bảng Menu 3D tối giản: Nền trắng glass, viền đỏ, hiển thị thanh danh sách các điểm chính
        menuCanvas = document.createElement('canvas');
        menuCanvas.width = 900;
        menuCanvas.height = 1000;
        menuCtx = menuCanvas.getContext('2d');

        menuTexture = new THREE.CanvasTexture(menuCanvas);
        menuTexture.minFilter = THREE.LinearFilter;
        menuTexture.magFilter = THREE.LinearFilter;

        const panelMat = new THREE.MeshBasicMaterial({
            map: menuTexture,
            transparent: true,
            depthTest: false,
            side: THREE.DoubleSide
        });
        vrMenuPanelMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.33), panelMat);
        vrMenuPanelMesh.name = 'vrMenuPanelMesh';
        vrMenuPanelMesh.visible = false;
        vrMenuPanelMesh.renderOrder = 350;
        vrMenuGroup.add(vrMenuPanelMesh);
    }

    function toggleVRMenu(forceState) {
        if (forceState !== undefined) {
            isMenuOpen = forceState;
        } else {
            isMenuOpen = !isMenuOpen;
        }

        if (isMenuOpen) {
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            camDir.y = 0;
            if (camDir.lengthSq() < 0.001) camDir.set(0, 0, -1);
            camDir.normalize();

            vrMenuPanelMesh.position.copy(camera.position).add(camDir.clone().multiplyScalar(2.0));
            vrMenuPanelMesh.position.y = camera.position.y;
            vrMenuPanelMesh.lookAt(camera.position);

            vrMenuPanelMesh.visible = true;
            if (vrMenuBtnMesh) vrMenuBtnMesh.visible = false;

            renderMenuCanvas();
            console.log('[WebXRBridge] Đã mở Bảng Menu Danh Sách Địa Điểm 3D (Tối giản White Glass).');
        } else {
            if (vrMenuPanelMesh) vrMenuPanelMesh.visible = false;
            if (vrMenuBtnMesh) vrMenuBtnMesh.visible = true;
            console.log('[WebXRBridge] Đã đóng Bảng Menu Danh Sách Địa Điểm 3D.');
        }
    }

    function updateVRMenuFloatingPositions() {
        if (!camera || !vrMenuBtnMesh) return;

        // Cố định nút ở góc trên bên trái tầm nhìn của người xem (HUD)
        // Luôn tự động xoay và di chuyển theo góc quay của đầu/camera 100% thời gian thực
        if (vrMenuBtnMesh.parent !== camera) {
            camera.add(vrMenuBtnMesh);
        }

        // Tọa độ góc trên bên trái: x = -0.54 (trái), y = 0.34 (trên), z = -1.6 (cách mắt 1.6m)
        vrMenuBtnMesh.position.set(-0.54, 0.34, -1.6);
        vrMenuBtnMesh.rotation.set(0, 0, 0);
        vrMenuBtnMesh.visible = !isMenuOpen;
    }

    function renderMenuCanvas() {
        if (!menuCtx || !manifest || !manifest._meta) return;
        const groups = manifest._meta.groups || [];
        if (groups.length === 0) return;

        menuClickTargets = [];
        menuCtx.clearRect(0, 0, 900, 1000);

        // 1. Khung nền chính (Trắng Glass, Viền đỏ đồng bộ với nút Địa điểm)
        menuCtx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        menuCtx.strokeStyle = '#ef4444';
        menuCtx.lineWidth = 6;
        roundRect(menuCtx, 10, 10, 880, 980, 32);
        menuCtx.fill();
        menuCtx.stroke();

        // 2. Thanh tiêu đề Header
        menuCtx.fillStyle = 'rgba(254, 242, 242, 0.95)';
        menuCtx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        menuCtx.lineWidth = 2;
        roundRect(menuCtx, 22, 22, 856, 80, 22);
        menuCtx.fill();
        menuCtx.stroke();

        menuCtx.fillStyle = '#dc2626';
        menuCtx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
        menuCtx.textAlign = 'left';
        menuCtx.textBaseline = 'middle';
        menuCtx.fillText('📍 DANH SÁCH ĐỊA ĐIỂM', 45, 58);

        // Nút Đóng [✕]
        const closeBtn = { x: 790, y: 34, w: 72, h: 56 };
        menuCtx.fillStyle = '#ef4444';
        roundRect(menuCtx, closeBtn.x, closeBtn.y, closeBtn.w, closeBtn.h, 14);
        menuCtx.fill();

        menuCtx.fillStyle = '#ffffff';
        menuCtx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
        menuCtx.textAlign = 'center';
        menuCtx.textBaseline = 'middle';
        menuCtx.fillText('✕', closeBtn.x + closeBtn.w / 2, closeBtn.y + closeBtn.h / 2);

        menuClickTargets.push({
            type: 'close',
            x: closeBtn.x,
            y: closeBtn.y,
            w: closeBtn.w,
            h: closeBtn.h
        });

        // 3. Danh sách các điểm chính (Thanh ngang từng điểm, tối giản, thanh lịch)
        const itemX = 30;
        const itemW = 840;
        const itemH = 80;
        const itemGap = 12;
        let currentY = 120;

        // Xác định tour đang đứng hiện tại
        const activeSceneData = manifest[activeSceneId];
        const activeTourId = activeSceneData ? activeSceneData.tour : '';

        groups.forEach((grp) => {
            const isCurrentLoc = grp.id === activeTourId || grp.scenes.some(s => s.id === activeSceneId);
            const firstSceneId = grp.scenes && grp.scenes.length > 0 ? grp.scenes[0].id : '';

            // Nền từng thanh điểm chính
            if (isCurrentLoc) {
                menuCtx.fillStyle = 'rgba(254, 226, 226, 0.96)'; // Nền hồng trắng nhẹ nổi bật điểm đang đứng
                menuCtx.strokeStyle = '#ef4444'; // Viền đỏ đậm
                menuCtx.lineWidth = 4;
            } else {
                menuCtx.fillStyle = 'rgba(255, 255, 255, 0.85)'; // Nền trắng glass
                menuCtx.strokeStyle = 'rgba(239, 68, 68, 0.35)'; // Viền đỏ thanh mảnh
                menuCtx.lineWidth = 2;
            }

            roundRect(menuCtx, itemX, currentY, itemW, itemH, 18);
            menuCtx.fill();
            menuCtx.stroke();

            // Icon ghim đỏ & Tên điểm chính
            menuCtx.fillStyle = '#dc2626';
            menuCtx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
            menuCtx.textAlign = 'left';
            menuCtx.textBaseline = 'middle';
            menuCtx.fillText('📍', itemX + 20, currentY + itemH / 2);

            menuCtx.fillStyle = isCurrentLoc ? '#b91c1c' : '#1e293b';
            menuCtx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
            let labelText = grp.label || grp.id;
            if (menuCtx.measureText(labelText).width > 530) {
                while (labelText.length > 5 && menuCtx.measureText(labelText + '...').width > 530) {
                    labelText = labelText.slice(0, -1);
                }
                labelText += '...';
            }
            menuCtx.fillText(labelText, itemX + 58, currentY + itemH / 2);

            // Nút Badge bên phải: "Đang ở đây" hoặc "Khám phá ➔"
            const badgeW = isCurrentLoc ? 150 : 130;
            const badgeH = 44;
            const badgeX = itemX + itemW - badgeW - 18;
            const badgeY = currentY + (itemH - badgeH) / 2;

            if (isCurrentLoc) {
                menuCtx.fillStyle = '#ef4444';
                roundRect(menuCtx, badgeX, badgeY, badgeW, badgeH, 14);
                menuCtx.fill();

                menuCtx.fillStyle = '#ffffff';
                menuCtx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
                menuCtx.textAlign = 'center';
                menuCtx.textBaseline = 'middle';
                menuCtx.fillText('★ Đang ở đây', badgeX + badgeW / 2, badgeY + badgeH / 2);
            } else {
                menuCtx.fillStyle = 'rgba(254, 242, 242, 0.9)';
                menuCtx.strokeStyle = '#ef4444';
                menuCtx.lineWidth = 2;
                roundRect(menuCtx, badgeX, badgeY, badgeW, badgeH, 14);
                menuCtx.fill();
                menuCtx.stroke();

                menuCtx.fillStyle = '#dc2626';
                menuCtx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
                menuCtx.textAlign = 'center';
                menuCtx.textBaseline = 'middle';
                menuCtx.fillText('Khám phá ➔', badgeX + badgeW / 2, badgeY + badgeH / 2);
            }

            // Ghi nhận vùng bấm vào thanh điểm chính (Bao quát toàn bộ bề ngang để bấm cực nhạy)
            menuClickTargets.push({
                type: 'group',
                firstSceneId: firstSceneId,
                x: 15,
                y: currentY - 4,
                w: 870,
                h: itemH + itemGap
            });

            currentY += itemH + itemGap;
        });

        menuTexture.needsUpdate = true;
    }

    function handleMenuPanelClick(uv) {
        if (!uv || !menuClickTargets) return;
        const canvasX = uv.x * 900;
        const canvasY = (1.0 - uv.y) * 1000;

        for (const target of menuClickTargets) {
            if (canvasX >= target.x && canvasX <= target.x + target.w &&
                canvasY >= target.y && canvasY <= target.y + target.h) {

                if (target.type === 'close') {
                    toggleVRMenu(false);
                } else if (target.type === 'group' && target.firstSceneId) {
                    toggleVRMenu(false);
                    switchScene(target.firstSceneId);
                }
                break;
            }
        }
    }

    async function switchScene(sceneId) {
        if (!sceneId) return;
        if (isTransitioning) {
            console.warn('[WebXRBridge] Đang trong quá trình chuyển cảnh, bỏ qua:', sceneId);
            return;
        }
        if (sceneId === activeSceneId) {
            console.log('[WebXRBridge] Đã ở đúng cảnh này:', sceneId);
            return;
        }

        isTransitioning = true;
        try {
            const kp = window.krpanoObj || (document.getElementById ? document.getElementById('krpanoSWFObject') : null);
            if (kp && typeof kp.call === 'function') {
                try {
                    kp.call(`loadscene(${sceneId}, null, MERGE, BLEND(0.5));`);
                } catch (eKrpano) {
                    console.warn('[WebXRBridge] krpano sync warning:', eKrpano);
                }
            }

            await loadScene(sceneId, true);
        } catch (err) {
            console.error('[WebXRBridge] Lỗi trong switchScene:', sceneId, err);
        } finally {
            isTransitioning = false;
        }
    }

    function navigateRelativeScene(delta) {
        if (!manifest) return;
        const sceneIds = Object.keys(manifest).filter(k => k !== '_meta');
        const currentIndex = sceneIds.indexOf(activeSceneId);
        if (currentIndex < 0) return;

        let nextIndex = (currentIndex + delta + sceneIds.length) % sceneIds.length;
        switchScene(sceneIds[nextIndex]);
    }

    function onSelectStart(event) {
        const controller = event.target;
        if (!controller) return;

        setRaycasterFromController(controller);

        if (isMenuOpen && vrMenuPanelMesh && vrMenuPanelMesh.visible) {
            const menuHits = raycaster.intersectObject(vrMenuPanelMesh, false);
            if (menuHits.length > 0) {
                if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators[0]) {
                    try { controller.gamepad.hapticActuators[0].pulse(0.6, 40); } catch (e) {}
                }
                handleMenuPanelClick(menuHits[0].uv);
                return;
            }
        }

        if (vrMenuBtnMesh && vrMenuBtnMesh.visible) {
            const btnHits = raycaster.intersectObject(vrMenuBtnMesh, true);
            if (btnHits.length > 0) {
                if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators[0]) {
                    try { controller.gamepad.hapticActuators[0].pulse(0.8, 50); } catch (e) {}
                }
                toggleVRMenu();
                return;
            }
        }

        if (hotspotsGroup) {
            const targets = hotspotsGroup.children;
            const intersects = raycaster.intersectObjects(targets, true);

            if (intersects.length > 0) {
                let hit = intersects[0].object;
                while (hit && !hit.userData.isHotspot && hit.parent) {
                    hit = hit.parent;
                }

                if (hit && hit.userData && hit.userData.linkedscene) {
                    if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators[0]) {
                        try { controller.gamepad.hapticActuators[0].pulse(0.8, 60); } catch (e) {}
                    }
                    switchScene(hit.userData.linkedscene);
                }
            }
        }
    }

    function renderLoop(time, frame) {
        updateFade();

        if (skyMesh && camera) {
            skyMesh.position.copy(camera.position);
        }

        updateVRMenuFloatingPositions();

        if (hotspotsGroup) {
            hotspotsGroup.children.forEach(hs => {
                hs.lookAt(camera.position);

                if (hs.userData && hs.userData.baseY !== undefined) {
                    if (hs.userData.style === 'trenkhong' || hs.userData.style === 'vitri') {
                        hs.position.y = hs.userData.baseY + 0.08 * Math.sin(time * 0.003 + (hs.userData.pulseOffset || 0));
                    }
                }

                const pulse = 1 + 0.025 * Math.sin(time * 0.004 + (hs.userData.pulseOffset || 0));
                const targetScale = (hs === hoveredHotspot ? 1.15 : pulse);
                hs.scale.set(targetScale, targetScale, 1);
            });
        }

        handleControllerInteractions();
        handleGazeInteraction(time);

        renderer.render(scene, camera);
    }

    function handleControllerInteractions() {
        let anyControllerActive = false;

        controllers.forEach(controller => {
            if (!controller.visible) return;
            anyControllerActive = true;

            setRaycasterFromController(controller);

            const dot = controller.getObjectByName('dot');
            const laser = controller.getObjectByName('laser');

            // 1. Kiểm tra Bảng Menu 3D (Đảm bảo tia laser và con trỏ dừng chính xác trên mặt bảng Menu)
            if (isMenuOpen && vrMenuPanelMesh && vrMenuPanelMesh.visible) {
                const menuHits = raycaster.intersectObject(vrMenuPanelMesh, false);
                if (menuHits.length > 0) {
                    const hitDist = menuHits[0].distance;
                    if (laser) laser.scale.z = hitDist;
                    if (dot) dot.position.z = -hitDist;
                    return;
                }
            }

            // 2. Kiểm tra Nút mở Menu 3D (HUD Button)
            if (vrMenuBtnMesh && vrMenuBtnMesh.visible) {
                const btnHits = raycaster.intersectObject(vrMenuBtnMesh, true);
                if (btnHits.length > 0) {
                    const hitDist = btnHits[0].distance;
                    if (laser) laser.scale.z = hitDist;
                    if (dot) dot.position.z = -hitDist;
                    return;
                }
            }

            // 3. Kiểm tra các Hotspot 360°
            if (hotspotsGroup) {
                const targets = hotspotsGroup.children;
                const hits = raycaster.intersectObjects(targets, true);

                if (hits.length > 0) {
                    const hitDist = hits[0].distance;
                    if (laser) laser.scale.z = hitDist;
                    if (dot) dot.position.z = -hitDist;

                    let hitObj = hits[0].object;
                    while (hitObj && !hitObj.userData.isHotspot && hitObj.parent) {
                        hitObj = hitObj.parent;
                    }

                    if (hitObj && hitObj !== hoveredHotspot) {
                        hoveredHotspot = hitObj;
                        if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators[0]) {
                            try { controller.gamepad.hapticActuators[0].pulse(0.3, 15); } catch (e) {}
                        }
                    }
                } else {
                    if (laser) laser.scale.z = 6.0;
                    if (dot) dot.position.z = -6.0;
                    if (hoveredHotspot) {
                        hoveredHotspot = null;
                    }
                }
            } else {
                if (laser) laser.scale.z = 6.0;
                if (dot) dot.position.z = -6.0;
            }

            if (controller.gamepad && controller.gamepad.axes && controller.gamepad.axes.length >= 4) {
                const stickX = controller.gamepad.axes[2];
                const stickY = controller.gamepad.axes[3];
                const now = Date.now();
                if (now - lastThumbstickTime > 500) {
                    if (stickX > 0.6) {
                        navigateRelativeScene(1);
                        lastThumbstickTime = now;
                    } else if (stickX < -0.6) {
                        navigateRelativeScene(-1);
                        lastThumbstickTime = now;
                    } else if (stickY > 0.6) {
                        toggleVRMenu();
                        lastThumbstickTime = now;
                    }
                }
            }
        });

        if (gazeReticle) {
            gazeReticle.visible = !anyControllerActive;
        }
    }

    function handleGazeInteraction(time) {
        if (!gazeReticle || !gazeReticle.visible) return;

        raycaster.set(camera.position, camera.getWorldDirection(new THREE.Vector3()));

        if (vrMenuBtnMesh && vrMenuBtnMesh.visible) {
            const btnHits = raycaster.intersectObject(vrMenuBtnMesh, true);
            if (btnHits.length > 0) {
                if (gazeTarget !== vrMenuBtnMesh) {
                    gazeTarget = vrMenuBtnMesh;
                    gazeStartTime = time;
                } else {
                    const elapsed = time - gazeStartTime;
                    const progress = Math.min(1.0, elapsed / GAZE_DWELL_TIME);
                    gazeReticle.scale.set(1 + progress * 0.5, 1 + progress * 0.5, 1);
                    if (elapsed >= GAZE_DWELL_TIME) {
                        toggleVRMenu();
                        gazeTarget = null;
                        gazeReticle.scale.set(1, 1, 1);
                    }
                }
                return;
            }
        }

        if (hotspotsGroup) {
            const targets = hotspotsGroup.children;
            const hits = raycaster.intersectObjects(targets, true);

            if (hits.length > 0) {
                let hit = hits[0].object;
                while (hit && !hit.userData.isHotspot && hit.parent) {
                    hit = hit.parent;
                }

                if (hit !== gazeTarget) {
                    gazeTarget = hit;
                    gazeStartTime = time;
                } else {
                    const elapsed = time - gazeStartTime;
                    const progress = Math.min(1.0, elapsed / GAZE_DWELL_TIME);
                    gazeReticle.scale.set(1 + progress * 0.5, 1 + progress * 0.5, 1);

                    if (elapsed >= GAZE_DWELL_TIME) {
                        if (gazeTarget.userData && gazeTarget.userData.linkedscene) {
                            switchScene(gazeTarget.userData.linkedscene);
                        }
                        gazeTarget = null;
                        gazeReticle.scale.set(1, 1, 1);
                    }
                }
                return;
            }
        }

        gazeTarget = null;
        gazeReticle.scale.set(1, 1, 1);
    }

    let fadeAnim = {
        active: false,
        from: 0,
        to: 0,
        startTime: 0,
        duration: 0,
        resolve: null
    };

    /**
     * Cập nhật chuyển sắc (Fade In/Out) đồng bộ 100% với Frame vòng lặp render của WebXR
     */
    function updateFade() {
        if (!fadeAnim.active || !fadeMesh) return;
        const now = performance.now();
        const elapsed = now - fadeAnim.startTime;
        const t = Math.min(1.0, elapsed / Math.max(1, fadeAnim.duration));

        if (fadeMesh.material) {
            fadeMesh.material.opacity = fadeAnim.from + (fadeAnim.to - fadeAnim.from) * t;
        }

        if (t >= 1.0) {
            fadeAnim.active = false;
            if (fadeAnim.resolve) {
                const res = fadeAnim.resolve;
                fadeAnim.resolve = null;
                res();
            }
        }
    }

    /**
     * Chuyển sắc mượt mà không dùng window.requestAnimationFrame (tránh bị treo/đơ trên Oculus Browser)
     */
    function tweenFade(fromAlpha, toAlpha, duration = 150) {
        if (!fadeMesh) return Promise.resolve();
        return new Promise(resolve => {
            fadeAnim.active = true;
            fadeAnim.from = fromAlpha;
            fadeAnim.to = toAlpha;
            fadeAnim.startTime = performance.now();
            fadeAnim.duration = duration;
            fadeAnim.resolve = resolve;

            if (fadeMesh.material) {
                fadeMesh.material.opacity = fromAlpha;
            }

            // Fallback timeout sau (duration + 100ms) để triệt để không bao giờ bị nghẽn lệnh
            setTimeout(() => {
                if (fadeAnim.active && fadeAnim.resolve === resolve) {
                    fadeAnim.active = false;
                    if (fadeMesh.material) fadeMesh.material.opacity = toAlpha;
                    fadeAnim.resolve = null;
                    resolve();
                }
            }, duration + 100);
        });
    }

    function onSessionEnded() {
        xrSession = null;
        if (renderer) {
            renderer.setAnimationLoop(null);
        }
        console.log('[WebXRBridge] Đã thoát VR. Trở về giao diện tour 2D.');
    }

    function roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    return {
        init: init,
        isSupported: isSupported,
        enterVR: enterVR,
        enterSimulator: enterSimulator,
        exitSimulator: exitSimulator,
        toggleVRMenu: toggleVRMenu,
        isSimulatorRunning: () => isSimulator,
        loadScene: switchScene
    };
})();

// Tự động nạp manifest khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    if (window.WebXRBridge) {
        window.WebXRBridge.init();
    }
});
