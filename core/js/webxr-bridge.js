/**
 * WebXR Bridge for Ninh Phước 360
 * ============================================================================
 * Trải nghiệm Thực tế ảo Immersive 360 độ (Full 360°) chuẩn W3C WebXR
 * Tối ưu hoá độ nét tối đa (Retina Crisp 10K Resolution) cho Meta Quest 3, Quest 2, Quest Pro và Pico 4.
 * Đồng bộ 100% với Web: Cảnh ban đầu, góc nhìn mặc định (hlookat/vlookat), Hotspot styles & scale.
 * Tích hợp Bảng Menu 3D Danh Sách Địa Điểm (Glassmorphism Web Style) tương tác trực tiếp trong VR & Simulator.
 * ============================================================================
 */

window.WebXRBridge = (function () {
    let manifest = null;
    let isInitialized = false;

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
     * Nạp dữ liệu manifest đã trích xuất sẵn (Cảnh, Hotspot, Góc nhìn, Nhóm địa danh)
     */
    async function init() {
        if (isInitialized) return;
        try {
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

            // Xác định cảnh bắt đầu: ưu tiên KrPano hiện tại -> manifest._meta.startScene (Toàn cảnh 300m)
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

        // KÍCH HOẠT ĐỘ PHÂN GIẢI NATIVE GỐC CỦA MÀN HÌNH META QUEST 3
        if (renderer.xr.setFramebufferScaleFactor) {
            const nativeScale = (typeof XRWebGLLayer !== 'undefined' && XRWebGLLayer.getNativeFramebufferScaleFactor)
                ? XRWebGLLayer.getNativeFramebufferScaleFactor(session)
                : 1.5;
            renderer.xr.setFramebufferScaleFactor(nativeScale);
            console.log('[WebXRBridge] Đã kích hoạt Native Framebuffer Scale Factor:', nativeScale);
        }

        renderer.xr.setSession(session);

        // TẮT LÀM MỜ RÌA MẮT (FIXED FOVEATION = 0 ĐỂ TOÀN BỘ 360 ĐỀU SẮC NÉT)
        if (session.renderState && session.renderState.baseLayer) {
            session.renderState.baseLayer.fixedFoveation = 0;
        }

        setupControllers();
        setupGazeReticle();

        renderer.setAnimationLoop(renderLoop);
    }

    /**
     * Cấu hình tia laser định vị cho tay cầm Meta Quest Touch
     */
    function setupControllers() {
        controllers = [];

        for (let i = 0; i < 2; i++) {
            const controller = renderer.xr.getController(i);
            controller.addEventListener('selectstart', onSelectStart);

            // Tia laser mỏng phát sáng
            const laserGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -8)
            ]);
            const laserMat = new THREE.LineBasicMaterial({
                color: 0x00f0ff,
                transparent: true,
                opacity: 0.6,
                linewidth: 2
            });
            const laser = new THREE.Line(laserGeo, laserMat);
            laser.name = 'laser';
            controller.add(laser);

            // Điểm sáng ở đầu tia laser
            const dotGeo = new THREE.SphereGeometry(0.015, 12, 12);
            const dotMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.z = -8;
            dot.name = 'dot';
            controller.add(dot);

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

        // Độ cao mắt người chuẩn VR đứng: 1.6m
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

        // Container overlay full màn hình
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

        // Header bar phong cách cao cấp
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

    /**
     * Gắn sự kiện cho Simulator
     */
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

        const time = timestamp || performance.now();

        // 1. Cập nhật vị trí khối cầu skyMesh luôn đồng tâm với camera
        if (skyMesh && camera) {
            skyMesh.position.copy(camera.position);
        }

        // 2. Cập nhật vị trí nút mở menu 3D bám theo góc nhìn thoải mái
        updateVRMenuFloatingPositions();

        // 3. Xoay Hotspots hướng về camera (Billboard)
        if (hotspotsGroup) {
            hotspotsGroup.children.forEach(hs => {
                hs.lookAt(camera.position);

                const pulse = 1 + 0.05 * Math.sin(time * 0.004 + (hs.userData.pulseOffset || 0));
                const targetScale = (hs.userData.baseScale || 1.0) * (hs === hoveredHotspot ? 1.25 : pulse);
                hs.scale.set(targetScale, targetScale, 1);
            });
        }

        renderer.render(scene, camera);
    }

    /**
     * Thoát khỏi chế độ Giả lập VR
     */
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

        // 1. Đồng bộ góc nhìn mặc định: Xoay worldGroup quanh trục Y theo -hlookat
        const normHlookat = sceneData.hlookat !== undefined ? sceneData.hlookat : 0;
        const normVlookat = sceneData.vlookat !== undefined ? sceneData.vlookat : 0;

        if (worldGroup) {
            worldGroup.rotation.y = THREE.MathUtils.degToRad(-normHlookat);
        }

        // Trong simulator: camera nhìn thẳng (0, -vlookat) để mắt hướng vào điểm xuất phát tuyệt đẹp
        if (isSimulator) {
            simCamLon = 0;
            simCamLat = -normVlookat;
            updateSimCameraLook();
        }

        // Hiệu ứng mờ dần (Fade out) nếu chuyển cảnh
        if (useFade && fadeMesh) {
            await tweenFade(0, 1, 150);
        }

        // 2. Tầng 1: Nạp ngay ảnh Preview (256x256) cực nhanh để không bao giờ bị đen hình
        try {
            await loadPreviewCubemap(sceneData.preview);
        } catch (e) {
            console.error('[WebXRBridge] Lỗi khi nạp preview cubemap:', e);
        }

        // 3. Hiển thị nhãn thông báo tên cảnh tinh tế (tự biến mất sau 3.5s)
        showSceneToast(sceneData.title || sceneId);

        // 4. Tạo các Hotspot 3D sống động theo đúng style và scale
        createSceneHotspots(sceneData.hotspots || []);

        // Mở sáng trở lại (Fade in)
        if (useFade && fadeMesh) {
            await tweenFade(1, 0, 200);
        }

        // Vẽ lại menu nếu đang mở để highlight cảnh active mới
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
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
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

                // Khắc phục triệt để lệch mảng: Xoay 180 độ cho mặt u (Trời) và d (Đất)
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
                resolve();
            };
            img.onerror = reject;
            img.src = previewUrl;
        });
    }

    /**
     * Nạp và ghép ảnh Cubemap đa phân giải: Level 2 (5K) tức thì -> Level 3 (10K siêu nét nguyên gốc)
     */
    async function loadHighResTiles(tilesDir, sceneId) {
        const token = ++currentLoadingSceneToken;

        // BƯỚC 1: Nạp nhanh Level 2 (1280x1280) để nâng độ nét lên 5K trong chớp mắt
        try {
            const l2Canvases = await loadLevelTiles(tilesDir, 2);
            if (token !== currentLoadingSceneToken) return;

            if (l2Canvases) {
                applyCubeTextureToSky(createCubeTextureFromCanvases(l2Canvases));
                console.log('[WebXRBridge] Đã áp dụng Level 2 (1280x1280) cho:', sceneId);
            }
        } catch (e2) {
            console.warn('[WebXRBridge] Bỏ qua L2:', e2);
        }

        // BƯỚC 2: Tự động nâng cấp tiếp lên Level 3 (2560x2560 - Chuẩn 10K sắc nét nguyên bản)
        try {
            const l3Canvases = await loadLevelTiles(tilesDir, 3);
            if (token !== currentLoadingSceneToken) return;

            if (l3Canvases) {
                applyCubeTextureToSky(createCubeTextureFromCanvases(l3Canvases));
                console.log('[WebXRBridge] ĐÃ NÂNG CẤP ĐẠT ĐỈNH LEVEL 3 (2560x2560, 10K Retina) cho:', sceneId);
            }
        } catch (e3) {
            console.log('[WebXRBridge] Giữ nguyên Level 2 cho:', sceneId);
        }
    }

    /**
     * Nạp các mảnh tile cho từng Level (Level 2: 1280x1280 hoặc Level 3: 2560x2560)
     */
    async function loadLevelTiles(tilesDir, level) {
        const faces = ['l', 'r', 'u', 'd', 'b', 'f'];

        if (level === 3) {
            // Level 3: 2560x2560 (5 hàng x 5 cột = 25 mảnh gạch 512x512)
            const rows = ['01', '02', '03', '04', '05'];
            const cols = ['01', '02', '03', '04', '05'];

            const facePromises = faces.map(async (face) => {
                const canvas = document.createElement('canvas');
                canvas.width = 2560;
                canvas.height = 2560;
                const ctx = canvas.getContext('2d');

                const tilePositions = [];
                for (let rIdx = 0; rIdx < 5; rIdx++) {
                    for (let cIdx = 0; cIdx < 5; cIdx++) {
                        tilePositions.push({
                            r: rows[rIdx],
                            c: cols[cIdx],
                            x: cIdx * 512,
                            y: rIdx * 512
                        });
                    }
                }

                const tileImgs = await Promise.all(
                    tilePositions.map(pos => loadImage(`${tilesDir}/${face}/l3/${pos.r}/l3_${face}_${pos.r}_${pos.c}.jpg`))
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

        // Level 2: 1280x1280 (3 hàng x 3 cột = 9 mảnh gạch)
        const facePromises = faces.map(async (face) => {
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 1280;
            const ctx = canvas.getContext('2d');

            try {
                const tilePositions = [
                    { r: '01', c: '01', x: 0, y: 0 },
                    { r: '01', c: '02', x: 512, y: 0 },
                    { r: '01', c: '03', x: 1024, y: 0 },
                    { r: '02', c: '01', x: 0, y: 512 },
                    { r: '02', c: '02', x: 512, y: 512 },
                    { r: '02', c: '03', x: 1024, y: 512 },
                    { r: '03', c: '01', x: 0, y: 1024 },
                    { r: '03', c: '02', x: 512, y: 1024 },
                    { r: '03', c: '03', x: 1024, y: 1024 }
                ];

                const tileImgs = await Promise.all(
                    tilePositions.map(pos => loadImage(`${tilesDir}/${face}/l2/${pos.r}/l2_${face}_${pos.r}_${pos.c}.jpg`))
                );

                tilePositions.forEach((pos, idx) => {
                    ctx.drawImage(tileImgs[idx], pos.x, pos.y);
                });

                if (face === 'u' || face === 'd') {
                    return rotateCanvas180(canvas);
                }
                return canvas;
            } catch (errL2) {
                // Fallback Level 1 (640x640)
                canvas.width = 640;
                canvas.height = 640;
                const p1 = loadImage(`${tilesDir}/${face}/l1/01/l1_${face}_01_01.jpg`);
                const p2 = loadImage(`${tilesDir}/${face}/l1/01/l1_${face}_01_02.jpg`);
                const p3 = loadImage(`${tilesDir}/${face}/l1/02/l1_${face}_02_01.jpg`);
                const p4 = loadImage(`${tilesDir}/${face}/l1/02/l1_${face}_02_02.jpg`);
                const [img1, img2, img3, img4] = await Promise.all([p1, p2, p3, p4]);
                ctx.drawImage(img1, 0, 0);
                ctx.drawImage(img2, 512, 0);
                ctx.drawImage(img3, 0, 512);
                ctx.drawImage(img4, 512, 512);

                if (face === 'u' || face === 'd') {
                    return rotateCanvas180(canvas);
                }
                return canvas;
            }
        });

        return await Promise.all(facePromises);
    }

    function createCubeTextureFromCanvases(faceCanvases) {
        const cubeTex = new THREE.CubeTexture(faceCanvases);
        cubeTex.generateMipmaps = true;
        cubeTex.minFilter = THREE.LinearMipmapLinearFilter;
        cubeTex.magFilter = THREE.LinearFilter;
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
    // HỆ THỐNG HOTSPOTS 3D ĐỒNG BỘ STYLE VÀ SCALE TỪ XML
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
            hotspotsGroup.add(mesh);
        });
    }

    /**
     * Tạo một Hotspot 3D Billboard luôn hướng mặt về phía người dùng
     */
    function createHotspotBillboard(ath, atv, linkedscene, title, style, scale) {
        const R = 8.0;
        const radAth = ath * (Math.PI / 180);
        const radAtv = atv * (Math.PI / 180);

        const r_h = R * Math.cos(radAtv);
        const x = r_h * Math.sin(radAth);
        const z = -r_h * Math.cos(radAth);
        const y = 1.6 - R * Math.sin(radAtv);

        const baseScale = (scale && scale > 0) ? scale : 1.0;

        // Vẽ biểu tượng Hotspot phát sáng trên Canvas 512x512
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        drawHotspotCanvas(ctx, title, style);

        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const geo = new THREE.PlaneGeometry(1.6 * baseScale, 1.6 * baseScale);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.renderOrder = 100;

        mesh.userData = {
            isHotspot: true,
            linkedscene: linkedscene,
            title: title,
            style: style,
            baseScale: baseScale,
            pulseOffset: Math.random() * Math.PI * 2
        };

        return mesh;
    }

    /**
     * Vẽ biểu tượng Hotspot theo phong cách Web (muiten, vitri, pulse_dot)
     */
    function drawHotspotCanvas(ctx, title, style) {
        ctx.clearRect(0, 0, 512, 512);

        const cx = 256;
        const cy = 200;

        if (style === 'vitri') {
            // ============================================
            // STYLE: vitri (Ghim định vị vàng cam hoàng hôn)
            // ============================================
            // Vòng hào quang phát sáng vàng cam
            const gradGlow = ctx.createRadialGradient(cx, cy - 10, 20, cx, cy - 10, 100);
            gradGlow.addColorStop(0, 'rgba(255, 179, 0, 0.7)');
            gradGlow.addColorStop(0.5, 'rgba(255, 140, 0, 0.25)');
            gradGlow.addColorStop(1, 'rgba(255, 140, 0, 0)');
            ctx.fillStyle = gradGlow;
            ctx.beginPath();
            ctx.arc(cx, cy - 10, 100, 0, Math.PI * 2);
            ctx.fill();

            // Thân ghim Location Pin (hình giọt nước chúc xuống)
            ctx.save();
            ctx.fillStyle = 'rgba(10, 25, 47, 0.95)';
            ctx.strokeStyle = '#ffb300';
            ctx.lineWidth = 8;

            ctx.beginPath();
            ctx.arc(cx, cy - 25, 45, Math.PI, 0, false);
            ctx.bezierCurveTo(cx + 45, cy + 10, cx + 18, cy + 38, cx, cy + 62);
            ctx.bezierCurveTo(cx - 18, cy + 38, cx - 45, cy + 10, cx - 45, cy - 25);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Điểm tròn phát sáng ở giữa ghim
            ctx.fillStyle = '#ffb300';
            ctx.beginPath();
            ctx.arc(cx, cy - 25, 18, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy - 25, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

        } else if (style === 'pulse_dot') {
            // ============================================
            // STYLE: pulse_dot (Sóng radar nhấp nháy)
            // ============================================
            // Vòng sóng radar ngoài
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(cx, cy, 70, 0, Math.PI * 2);
            ctx.stroke();

            // Vòng sóng giữa
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(cx, cy, 45, 0, Math.PI * 2);
            ctx.stroke();

            // Chấm tròn lõi phát sáng
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(cx, cy, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

        } else {
            // ============================================
            // STYLE: muiten hoặc mặc định (Chevron Arrow Neon Cyan)
            // ============================================
            const gradGlow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 90);
            gradGlow.addColorStop(0, 'rgba(0, 240, 255, 0.65)');
            gradGlow.addColorStop(0.5, 'rgba(0, 240, 255, 0.2)');
            gradGlow.addColorStop(1, 'rgba(0, 240, 255, 0)');
            ctx.fillStyle = gradGlow;
            ctx.beginPath();
            ctx.arc(cx, cy, 90, 0, Math.PI * 2);
            ctx.fill();

            // Vòng tròn trung tâm
            ctx.fillStyle = 'rgba(10, 25, 47, 0.92)';
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(cx, cy, 55, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Mũi tên tiến Chevron
            ctx.fillStyle = '#00f0ff';
            ctx.beginPath();
            ctx.moveTo(cx, cy - 25);
            ctx.lineTo(cx + 25, cy + 5);
            ctx.lineTo(cx + 14, cy + 18);
            ctx.lineTo(cx, cy + 4);
            ctx.lineTo(cx - 14, cy + 18);
            ctx.lineTo(cx - 25, cy + 5);
            ctx.closePath();
            ctx.fill();
        }

        // Biển tên điểm đến bên dưới (Pill badge)
        if (title) {
            ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
            const textMetrics = ctx.measureText(title);
            const badgeW = Math.min(480, Math.max(160, textMetrics.width + 50));
            const badgeH = 64;
            const badgeX = cx - badgeW / 2;
            const badgeY = cy + 75;

            // Nền bóng kính
            ctx.fillStyle = 'rgba(5, 12, 28, 0.9)';
            ctx.strokeStyle = (style === 'vitri') ? '#ffb300' : '#00f0ff';
            ctx.lineWidth = 4;
            roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 18);
            ctx.fill();
            ctx.stroke();

            // Chữ
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(title, cx, badgeY + badgeH / 2);
        }
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
    // Phục vụ chuẩn xác trải nghiệm trong Kính VR và Desktop Simulator
    // ============================================================

    /**
     * Dựng sẵn các Mesh 3D của Menu
     */
    function buildVRMenu3DComponents() {
        vrMenuGroup.clear();

        // 1. Nút 3D mở Menu nhỏ nổi dưới tầm mắt
        const btnCanvas = document.createElement('canvas');
        btnCanvas.width = 512;
        btnCanvas.height = 180;
        const bCtx = btnCanvas.getContext('2d');

        bCtx.fillStyle = 'rgba(5, 12, 28, 0.9)';
        bCtx.strokeStyle = '#00f0ff';
        bCtx.lineWidth = 8;
        roundRect(bCtx, 10, 10, 492, 160, 40);
        bCtx.fill();
        bCtx.stroke();

        bCtx.fillStyle = '#ffb300';
        bCtx.font = 'bold 50px "Segoe UI", Arial, sans-serif';
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        bCtx.fillText('📍 ĐỊA ĐIỂM', 256, 90);

        const btnTex = new THREE.CanvasTexture(btnCanvas);
        const btnMat = new THREE.MeshBasicMaterial({
            map: btnTex,
            transparent: true,
            depthTest: false
        });
        vrMenuBtnMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), btnMat);
        vrMenuBtnMesh.name = 'vrMenuBtnMesh';
        vrMenuBtnMesh.renderOrder = 300;
        vrMenuGroup.add(vrMenuBtnMesh);

        // 2. Bảng Menu 3D lớn hiển thị Danh sách địa điểm (Glassmorphism Web Style)
        menuCanvas = document.createElement('canvas');
        menuCanvas.width = 1600;
        menuCanvas.height = 1100;
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
        // Bảng kích thước 2.4m x 1.65m đặt ở tầm mắt
        vrMenuPanelMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.65), panelMat);
        vrMenuPanelMesh.name = 'vrMenuPanelMesh';
        vrMenuPanelMesh.visible = false;
        vrMenuPanelMesh.renderOrder = 350;
        vrMenuGroup.add(vrMenuPanelMesh);
    }

    /**
     * Bật / Tắt Bảng Menu 3D
     */
    function toggleVRMenu(forceState) {
        if (forceState !== undefined) {
            isMenuOpen = forceState;
        } else {
            isMenuOpen = !isMenuOpen;
        }

        if (isMenuOpen) {
            // Mở menu: đặt bảng cách camera 2.4 mét về phía trước
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            camDir.y = 0;
            if (camDir.lengthSq() < 0.001) camDir.set(0, 0, -1);
            camDir.normalize();

            vrMenuPanelMesh.position.copy(camera.position).add(camDir.clone().multiplyScalar(2.4));
            vrMenuPanelMesh.position.y = camera.position.y; // ngang tầm mắt
            vrMenuPanelMesh.lookAt(camera.position);

            vrMenuPanelMesh.visible = true;
            if (vrMenuBtnMesh) vrMenuBtnMesh.visible = false;

            renderMenuCanvas();
            console.log('[WebXRBridge] Đã mở Bảng Menu Danh Sách Địa Điểm 3D.');
        } else {
            // Đóng menu
            if (vrMenuPanelMesh) vrMenuPanelMesh.visible = false;
            if (vrMenuBtnMesh) vrMenuBtnMesh.visible = true;
            console.log('[WebXRBridge] Đã đóng Bảng Menu Danh Sách Địa Điểm 3D.');
        }
    }

    /**
     * Cập nhật vị trí của Nút mở Menu lơ lửng dưới tầm nhìn
     */
    function updateVRMenuFloatingPositions() {
        if (!camera || isMenuOpen || !vrMenuBtnMesh) return;

        // Đặt nút nhỏ ở phía dưới góc nhìn: cách 2.0m, thấp xuống 0.75m
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        if (camDir.lengthSq() < 0.001) camDir.set(0, 0, -1);
        camDir.normalize();

        vrMenuBtnMesh.position.copy(camera.position).add(camDir.multiplyScalar(2.0));
        vrMenuBtnMesh.position.y = camera.position.y - 0.75;
        vrMenuBtnMesh.lookAt(camera.position);
    }

    /**
     * Vẽ Bảng Menu lên Canvas 1600x1100 px chuẩn Dark Glassmorphism giống hệt Web
     */
    function renderMenuCanvas() {
        if (!menuCtx || !manifest || !manifest._meta) return;
        const groups = manifest._meta.groups || [];
        if (groups.length === 0) return;

        menuClickTargets = [];
        menuCtx.clearRect(0, 0, 1600, 1100);

        // 1. Khung nền chính (Dark Glassmorphism)
        menuCtx.fillStyle = 'rgba(5, 12, 28, 0.94)';
        menuCtx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
        menuCtx.lineWidth = 6;
        roundRect(menuCtx, 10, 10, 1580, 1080, 36);
        menuCtx.fill();
        menuCtx.stroke();

        // 2. Header Bar
        menuCtx.fillStyle = 'rgba(10, 25, 47, 0.9)';
        roundRect(menuCtx, 16, 16, 1568, 110, 26);
        menuCtx.fill();

        // Tiêu đề
        menuCtx.fillStyle = '#00f0ff';
        menuCtx.font = 'bold 40px "Segoe UI", Arial, sans-serif';
        menuCtx.textAlign = 'left';
        menuCtx.textBaseline = 'middle';
        menuCtx.fillText('📍 DANH SÁCH ĐỊA ĐIỂM — NINH PHƯỚC 360', 50, 70);

        menuCtx.fillStyle = '#94a3b8';
        menuCtx.font = '500 22px "Segoe UI", Arial, sans-serif';
        menuCtx.fillText('Trỏ laser hoặc nhấp vào ảnh để chuyển cảnh', 900, 70);

        // Nút Đóng [✕]
        const closeBtn = { x: 1440, y: 35, w: 120, h: 70 };
        menuCtx.fillStyle = 'rgba(220, 38, 38, 0.9)';
        menuCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        menuCtx.lineWidth = 2;
        roundRect(menuCtx, closeBtn.x, closeBtn.y, closeBtn.w, closeBtn.h, 14);
        menuCtx.fill();
        menuCtx.stroke();

        menuCtx.fillStyle = '#ffffff';
        menuCtx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
        menuCtx.textAlign = 'center';
        menuCtx.fillText('✕ Đóng', closeBtn.x + closeBtn.w / 2, closeBtn.y + closeBtn.h / 2);

        menuClickTargets.push({
            type: 'close',
            x: closeBtn.x,
            y: closeBtn.y,
            w: closeBtn.w,
            h: closeBtn.h
        });

        // 3. Cột Trái: Danh mục Nhóm địa điểm (Groups Accordion)
        const colLeftX = 40;
        const colLeftW = 460;
        let groupY = 150;

        menuCtx.fillStyle = '#64748b';
        menuCtx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
        menuCtx.textAlign = 'left';
        menuCtx.fillText('KHU VỰC & ĐỊA DANH', colLeftX + 10, groupY);
        groupY += 30;

        groups.forEach((grp, idx) => {
            const isSelected = idx === selectedGroupIndex;
            const itemH = 74;

            if (isSelected) {
                // Gradient rực rỡ như .tour-group:not(.collapsed) .tour-title trong style.css
                const grad = menuCtx.createLinearGradient(colLeftX, groupY, colLeftX + colLeftW, groupY);
                grad.addColorStop(0, '#00c6ff');
                grad.addColorStop(1, '#0072ff');
                menuCtx.fillStyle = grad;
                menuCtx.strokeStyle = '#ffffff';
                menuCtx.lineWidth = 3;
            } else {
                menuCtx.fillStyle = 'rgba(15, 23, 42, 0.75)';
                menuCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
                menuCtx.lineWidth = 2;
            }

            roundRect(menuCtx, colLeftX, groupY, colLeftW, itemH, 16);
            menuCtx.fill();
            menuCtx.stroke();

            // Icon + Tên nhóm
            menuCtx.fillStyle = isSelected ? '#ffffff' : '#e2e8f0';
            menuCtx.font = `bold ${isSelected ? '22px' : '20px'} "Segoe UI", Arial, sans-serif`;
            menuCtx.textAlign = 'left';
            menuCtx.textBaseline = 'middle';
            const grpLabel = grp.label.length > 22 ? grp.label.slice(0, 20) + '...' : grp.label;
            menuCtx.fillText('📍 ' + grpLabel, colLeftX + 20, groupY + itemH / 2);

            // Badge số lượng cảnh
            const badgeW = 90;
            const badgeH = 34;
            const badgeX = colLeftX + colLeftW - badgeW - 16;
            const badgeY = groupY + (itemH - badgeH) / 2;

            menuCtx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 179, 0, 0.2)';
            roundRect(menuCtx, badgeX, badgeY, badgeW, badgeH, 12);
            menuCtx.fill();

            menuCtx.fillStyle = isSelected ? '#ffffff' : '#ffb300';
            menuCtx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
            menuCtx.textAlign = 'center';
            menuCtx.fillText(`${grp.scenes.length} cảnh`, badgeX + badgeW / 2, badgeY + badgeH / 2);

            menuClickTargets.push({
                type: 'group',
                index: idx,
                x: colLeftX,
                y: groupY,
                w: colLeftW,
                h: itemH
            });

            groupY += itemH + 12;
        });

        // 4. Cột Phải: Lưới ảnh các Cảnh trong nhóm đang chọn (2 cột x 4 dòng)
        const colRightX = 530;
        const colRightW = 1030;
        const currentGroup = groups[selectedGroupIndex] || groups[0];
        const allScenes = currentGroup ? currentGroup.scenes : [];

        // Tiêu đề cột phải
        menuCtx.fillStyle = '#64748b';
        menuCtx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
        menuCtx.textAlign = 'left';
        menuCtx.fillText(`DANH SÁCH CẢNH (${allScenes.length} CẢNH) — ${currentGroup ? currentGroup.label : ''}`, colRightX + 10, 150);

        const totalPages = Math.ceil(allScenes.length / SCENES_PER_PAGE);
        if (menuPageIndex >= totalPages) menuPageIndex = Math.max(0, totalPages - 1);

        const pageScenes = allScenes.slice(menuPageIndex * SCENES_PER_PAGE, (menuPageIndex + 1) * SCENES_PER_PAGE);

        const cardW = 495;
        const cardH = 96;
        const gapX = 24;
        const gapY = 16;
        const startGridY = 180;

        pageScenes.forEach((sc, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const cardX = colRightX + col * (cardW + gapX);
            const cardY = startGridY + row * (cardH + gapY);

            const isActiveScene = sc.id === activeSceneId;

            // Khung card
            menuCtx.fillStyle = isActiveScene ? 'rgba(10, 35, 60, 0.95)' : 'rgba(15, 23, 42, 0.85)';
            menuCtx.strokeStyle = isActiveScene ? '#ffb300' : 'rgba(0, 240, 255, 0.35)';
            menuCtx.lineWidth = isActiveScene ? 4 : 2;
            roundRect(menuCtx, cardX, cardY, cardW, cardH, 16);
            menuCtx.fill();
            menuCtx.stroke();

            // Khung thumbnail ảnh
            const thumbX = cardX + 10;
            const thumbY = cardY + 10;
            const thumbW = 114;
            const thumbH = 76;

            if (menuThumbCache.has(sc.thumb)) {
                const cachedImg = menuThumbCache.get(sc.thumb);
                if (cachedImg.complete && cachedImg.naturalWidth > 0) {
                    menuCtx.save();
                    roundRect(menuCtx, thumbX, thumbY, thumbW, thumbH, 10);
                    menuCtx.clip();
                    menuCtx.drawImage(cachedImg, thumbX, thumbY, thumbW, thumbH);
                    menuCtx.restore();
                }
            } else if (sc.thumb) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    menuThumbCache.set(sc.thumb, img);
                    renderMenuCanvas(); // vẽ lại khi ảnh tải xong
                };
                img.src = sc.thumb;
                menuThumbCache.set(sc.thumb, img);

                // Khung tạm xám đẹp
                menuCtx.fillStyle = '#1e293b';
                roundRect(menuCtx, thumbX, thumbY, thumbW, thumbH, 10);
                menuCtx.fill();
            }

            // Tên cảnh
            menuCtx.fillStyle = isActiveScene ? '#ffb300' : '#ffffff';
            menuCtx.font = 'bold 21px "Segoe UI", Arial, sans-serif';
            menuCtx.textAlign = 'left';
            menuCtx.textBaseline = 'top';

            const textX = thumbX + thumbW + 18;
            const maxTextW = cardW - thumbW - 38;
            let displayTitle = sc.title || sc.id;
            if (menuCtx.measureText(displayTitle).width > maxTextW) {
                while (displayTitle.length > 5 && menuCtx.measureText(displayTitle + '...').width > maxTextW) {
                    displayTitle = displayTitle.slice(0, -1);
                }
                displayTitle += '...';
            }
            menuCtx.fillText(displayTitle, textX, cardY + 22);

            // Phụ đề nhỏ
            menuCtx.fillStyle = isActiveScene ? '#ffb300' : '#00f0ff';
            menuCtx.font = '600 15px "Segoe UI", Arial, sans-serif';
            menuCtx.fillText(isActiveScene ? '★ Đang đứng ở cảnh này' : 'Chạm để dịch chuyển ➔', textX, cardY + 54);

            menuClickTargets.push({
                type: 'scene',
                sceneId: sc.id,
                x: cardX,
                y: cardY,
                w: cardW,
                h: cardH
            });
        });

        // 5. Thanh điều hướng phân trang (nếu > 8 cảnh)
        if (totalPages > 1) {
            const navY = 660;
            const prevBtn = { x: colRightX + 20, y: navY, w: 200, h: 56 };
            const nextBtn = { x: colRightX + colRightW - 220, y: navY, w: 200, h: 56 };

            // Trang trước
            menuCtx.fillStyle = menuPageIndex > 0 ? 'rgba(0, 198, 255, 0.85)' : 'rgba(50, 65, 85, 0.4)';
            roundRect(menuCtx, prevBtn.x, prevBtn.y, prevBtn.w, prevBtn.h, 14);
            menuCtx.fill();
            menuCtx.fillStyle = '#fff';
            menuCtx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
            menuCtx.textAlign = 'center';
            menuCtx.fillText('◀ Trang trước', prevBtn.x + prevBtn.w / 2, prevBtn.y + prevBtn.h / 2);

            // Trang sau
            menuCtx.fillStyle = menuPageIndex < totalPages - 1 ? 'rgba(0, 198, 255, 0.85)' : 'rgba(50, 65, 85, 0.4)';
            roundRect(menuCtx, nextBtn.x, nextBtn.y, nextBtn.w, nextBtn.h, 14);
            menuCtx.fill();
            menuCtx.fillStyle = '#fff';
            menuCtx.fillText('Trang sau ▶', nextBtn.x + nextBtn.w / 2, nextBtn.y + nextBtn.h / 2);

            // Số trang
            menuCtx.fillStyle = '#94a3b8';
            menuCtx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
            menuCtx.fillText(`Trang ${menuPageIndex + 1} / ${totalPages}`, colRightX + colRightW / 2, navY + 28);

            if (menuPageIndex > 0) {
                menuClickTargets.push({
                    type: 'page_prev',
                    x: prevBtn.x,
                    y: prevBtn.y,
                    w: prevBtn.w,
                    h: prevBtn.h
                });
            }
            if (menuPageIndex < totalPages - 1) {
                menuClickTargets.push({
                    type: 'page_next',
                    x: nextBtn.x,
                    y: nextBtn.y,
                    w: nextBtn.w,
                    h: nextBtn.h
                });
            }
        }

        menuTexture.needsUpdate = true;
    }

    /**
     * Xử lý click trên Bảng Menu 3D (toạ độ UV từ Raycaster)
     */
    function handleMenuPanelClick(uv) {
        if (!uv || !menuClickTargets) return;
        const canvasX = uv.x * 1600;
        const canvasY = (1.0 - uv.y) * 1100;

        for (const target of menuClickTargets) {
            if (canvasX >= target.x && canvasX <= target.x + target.w &&
                canvasY >= target.y && canvasY <= target.y + target.h) {

                if (target.type === 'close') {
                    toggleVRMenu(false);
                } else if (target.type === 'group') {
                    selectedGroupIndex = target.index;
                    menuPageIndex = 0;
                    renderMenuCanvas();
                } else if (target.type === 'page_prev') {
                    if (menuPageIndex > 0) {
                        menuPageIndex--;
                        renderMenuCanvas();
                    }
                } else if (target.type === 'page_next') {
                    menuPageIndex++;
                    renderMenuCanvas();
                } else if (target.type === 'scene') {
                    switchScene(target.sceneId);
                    toggleVRMenu(false);
                }
                break;
            }
        }
    }

    /**
     * Chuyển cảnh trong VR và đồng bộ với KrPano
     */
    async function switchScene(sceneId) {
        if (isTransitioning || sceneId === activeSceneId) return;
        isTransitioning = true;

        // Báo KrPano cập nhật cảnh để kích hoạt audio/thuyết minh
        if (window.krpanoObj) {
            window.krpanoObj.call(`loadscene(${sceneId}, null, MERGE, BLEND(0.5));`);
        }

        await loadScene(sceneId, true);
        isTransitioning = false;
    }

    /**
     * Chuyển sang cảnh tiếp theo / cảnh trước bằng cần gạt Thumbstick hoặc phím A/D
     */
    function navigateRelativeScene(delta) {
        if (!manifest) return;
        const sceneIds = Object.keys(manifest).filter(k => k !== '_meta');
        const currentIndex = sceneIds.indexOf(activeSceneId);
        if (currentIndex < 0) return;

        let nextIndex = (currentIndex + delta + sceneIds.length) % sceneIds.length;
        switchScene(sceneIds[nextIndex]);
    }

    /**
     * Xử lý bóp cò (Trigger) trên tay cầm Meta Quest Touch trong WebXR thật
     */
    function onSelectStart(event) {
        const controller = event.target;
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        const rayDir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
        raycaster.set(controller.position, rayDir);

        // 1. Nếu Menu đang mở: Raycast trúng Bảng Menu
        if (isMenuOpen && vrMenuPanelMesh && vrMenuPanelMesh.visible) {
            const menuHits = raycaster.intersectObject(vrMenuPanelMesh, false);
            if (menuHits.length > 0) {
                if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators[0]) {
                    controller.gamepad.hapticActuators[0].pulse(0.6, 40);
                }
                handleMenuPanelClick(menuHits[0].uv);
                return;
            }
        }

        // 2. Nếu Raycast trúng Nút mở Menu 3D
        if (vrMenuBtnMesh && vrMenuBtnMesh.visible) {
            const btnHits = raycaster.intersectObject(vrMenuBtnMesh, true);
            if (btnHits.length > 0) {
                if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators[0]) {
                    controller.gamepad.hapticActuators[0].pulse(0.8, 50);
                }
                toggleVRMenu();
                return;
            }
        }

        // 3. Nếu Raycast trúng Hotspot trong cảnh
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
                        controller.gamepad.hapticActuators[0].pulse(0.8, 60);
                    }
                    switchScene(hit.userData.linkedscene);
                }
            }
        }
    }

    /**
     * Vòng lặp Render chính của WebXR trên kính thật
     */
    function renderLoop(time, frame) {
        // 1. skyMesh luôn đồng tâm với camera
        if (skyMesh && camera) {
            skyMesh.position.copy(camera.position);
        }

        // 2. Cập nhật vị trí nút mở menu 3D bám theo góc nhìn
        updateVRMenuFloatingPositions();

        // 3. Luôn xoay các Hotspot hướng mặt về phía camera (Billboard hoàn hảo)
        if (hotspotsGroup) {
            hotspotsGroup.children.forEach(hs => {
                hs.lookAt(camera.position);

                const pulse = 1 + 0.05 * Math.sin(time * 0.004 + (hs.userData.pulseOffset || 0));
                const targetScale = (hs.userData.baseScale || 1.0) * (hs === hoveredHotspot ? 1.25 : pulse);
                hs.scale.set(targetScale, targetScale, 1);
            });
        }

        // 4. Xử lý tương tác tay cầm Quest Touch
        handleControllerInteractions();

        // 5. Xử lý tâm ngắm tự động nếu không dùng tay cầm
        handleGazeInteraction(time);

        renderer.render(scene, camera);
    }

    /**
     * Xử lý tia laser ngắm và cần gạt Thumbstick
     */
    function handleControllerInteractions() {
        let anyControllerActive = false;

        controllers.forEach(controller => {
            if (!controller.visible) return;
            anyControllerActive = true;

            const tempMatrix = new THREE.Matrix4();
            tempMatrix.identity().extractRotation(controller.matrixWorld);

            const rayDir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
            raycaster.set(controller.position, rayDir);

            const dot = controller.getObjectByName('dot');

            // 1. Kiểm tra Menu Panel nếu đang mở
            if (isMenuOpen && vrMenuPanelMesh && vrMenuPanelMesh.visible) {
                const menuHits = raycaster.intersectObject(vrMenuPanelMesh, false);
                if (menuHits.length > 0) {
                    if (dot) dot.position.z = -menuHits[0].distance;
                    return;
                }
            }

            // 2. Kiểm tra Nút mở Menu
            if (vrMenuBtnMesh && vrMenuBtnMesh.visible) {
                const btnHits = raycaster.intersectObject(vrMenuBtnMesh, true);
                if (btnHits.length > 0) {
                    if (dot) dot.position.z = -btnHits[0].distance;
                    return;
                }
            }

            // 3. Kiểm tra Hotspots
            if (hotspotsGroup) {
                const targets = hotspotsGroup.children;
                const hits = raycaster.intersectObjects(targets, true);

                if (hits.length > 0) {
                    const dist = hits[0].distance;
                    if (dot) dot.position.z = -dist;

                    let hitObj = hits[0].object;
                    while (hitObj && !hitObj.userData.isHotspot && hitObj.parent) {
                        hitObj = hitObj.parent;
                    }

                    if (hitObj && hitObj !== hoveredHotspot) {
                        hoveredHotspot = hitObj;
                        if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators[0]) {
                            controller.gamepad.hapticActuators[0].pulse(0.3, 15);
                        }
                    }
                } else {
                    if (dot) dot.position.z = -8;
                    if (hoveredHotspot) {
                        hoveredHotspot = null;
                    }
                }
            }

            // Gạt cần Thumbstick: Gạt phải -> Cảnh kế, Gạt trái -> Cảnh trước
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
                        // Gạt xuống: mở/đóng Menu nhanh
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

    /**
     * Xử lý cơ chế ngắm tự động (Gaze Dwell)
     */
    function handleGazeInteraction(time) {
        if (!gazeReticle || !gazeReticle.visible) return;

        raycaster.set(camera.position, camera.getWorldDirection(new THREE.Vector3()));

        // Kiểm tra nút menu trước
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

        // Kiểm tra hotspots
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

    /**
     * Hiệu ứng chuyển cảnh mịn màng (Fade transition)
     */
    function tweenFade(fromAlpha, toAlpha, duration) {
        return new Promise(resolve => {
            const startTime = Date.now();
            const step = () => {
                const elapsed = Date.now() - startTime;
                const t = Math.min(1.0, elapsed / duration);
                if (fadeMesh && fadeMesh.material) {
                    fadeMesh.material.opacity = fromAlpha + (toAlpha - fromAlpha) * t;
                }
                if (t < 1.0) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            };
            step();
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
