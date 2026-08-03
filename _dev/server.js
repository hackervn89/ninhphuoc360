/**
 * Ninhphuoc360 Editor — Local Development Server
 * ================================================
 * Chạy: npm run editor
 * Mở:   http://localhost:3600
 * 
 * API Endpoints:
 *   GET  /api/scenes              — Danh sách scenes từ tour.xml
 *   POST /api/upload-pano         — Upload + auto-tile ảnh 360°
 *   POST /api/scenes/save         — Lưu hotspots vào scenes.xml
 *   POST /api/tour-xml/add-include — Thêm <include> vào tour.xml
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const xml2js = require('xml2js');

const app = express();
const PORT = 3600;
const DEV_DIR = __dirname; // _dev/ folder (delete when handing over)
const PROJECT_ROOT = path.resolve(__dirname, '..'); // Parent = actual tour project

// ============================================================
// CONFIGURATION
// ============================================================

// Path to krpanotools64.exe in _dev folder
const KRPANO_TOOLS = path.join(DEV_DIR, 'krpano-tools', 'krpanotools64.exe');
const KRPANO_CONFIG = path.join(DEV_DIR, 'krpano-tools', 'templates', 'krpano-editor.config');
const TOUR_XML_PATH = path.join(PROJECT_ROOT, 'tour.xml');
const TOURS_DIR = path.join(PROJECT_ROOT, 'tours');

// ============================================================
// MIDDLEWARE
// ============================================================

// Disable all browser caching for local editor development
app.use((req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve editor.html from _dev/ (not in the production project root)
app.get('/editor.html', (req, res) => {
    res.sendFile(path.join(DEV_DIR, 'editor.html'));
});

// Serve test page from _dev/
app.get('/test_hotspot.html', (req, res) => {
    res.sendFile(path.join(DEV_DIR, 'test_hotspot.html'));
});

// Serve all tour assets from the project root (parent of _dev/)
app.use(express.static(PROJECT_ROOT));

// Configure multer for panorama uploads
const upload = multer({
    dest: path.join(DEV_DIR, '_uploads_temp'),
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Định dạng file không hỗ trợ: ${ext}. Chỉ chấp nhận: ${allowedTypes.join(', ')}`));
        }
    }
});

// Map to track tiling jobs for SSE progress updates
const tilingJobs = new Map();

function sanitizeTourXmlIncludes() {
    if (!fs.existsSync(TOUR_XML_PATH)) return;
    let content = fs.readFileSync(TOUR_XML_PATH, 'utf-8');
    const includeRegex = /<include\s+url="(tours\/[^"]+)"\s*\/>/gi;
    let match;
    let modified = false;

    while ((match = includeRegex.exec(content)) !== null) {
        const includeUrl = match[1];
        const fullPath = path.join(PROJECT_ROOT, includeUrl);

        let isValid = false;
        if (fs.existsSync(fullPath)) {
            const xmlData = fs.readFileSync(fullPath, 'utf-8');
            if (xmlData.includes('<scene')) {
                isValid = true;
            }
        }

        if (!isValid) {
            console.log(`   🧹 Tự động dọn dẹp include không tồn tại: ${includeUrl}`);
            const lineRegex = new RegExp(`\\s*<include\\s+url="${escapeRegex(includeUrl)}"\\s*\\/>`, 'gi');
            content = content.replace(lineRegex, '');
            modified = true;
        }
    }

    if (modified) {
        fs.writeFileSync(TOUR_XML_PATH, content, 'utf-8');
    }
}

// ============================================================
// API: GET /api/scenes — Đọc danh sách scenes từ tour.xml
// ============================================================

app.get('/api/scenes', async (req, res) => {
    try {
        sanitizeTourXmlIncludes();

        // Parse tour.xml to find all <include> files
        const tourXml = fs.readFileSync(TOUR_XML_PATH, 'utf-8');
        const includeRegex = /<include\s+url="([^"]+)"\s*\/>/g;
        let match;
        const scenes = [];

        while ((match = includeRegex.exec(tourXml)) !== null) {
            const includeUrl = match[1];
            // Only process scene includes (in tours/ directory)
            if (includeUrl.startsWith('tours/') && includeUrl.endsWith('.xml')) {
                const scenesXmlPath = path.join(PROJECT_ROOT, includeUrl);
                if (fs.existsSync(scenesXmlPath)) {
                    try {
                        const scenesXml = fs.readFileSync(scenesXmlPath, 'utf-8');
                        const parsed = await xml2js.parseStringPromise(scenesXml, { explicitArray: false });
                        
                        // Handle both single scene and array of scenes
                        let sceneList = [];
                        if (parsed.krpano && parsed.krpano.scene) {
                            sceneList = Array.isArray(parsed.krpano.scene) 
                                ? parsed.krpano.scene 
                                : [parsed.krpano.scene];
                        } else if (parsed.scene) {
                            sceneList = Array.isArray(parsed.scene) 
                                ? parsed.scene 
                                : [parsed.scene];
                        }

                        sceneList.forEach(sc => {
                            const attrs = sc.$ || sc;
                            scenes.push({
                                name: attrs.name,
                                title: attrs.title || attrs.name,
                                thumburl: attrs.thumburl || '',
                                sourceFile: includeUrl
                            });
                        });
                    } catch (parseErr) {
                        console.warn(`⚠️ Không parse được ${includeUrl}:`, parseErr.message);
                    }
                }
            }
        }

        res.json({ success: true, scenes });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// API: POST /api/upload-pano — Upload ảnh 360° + Auto-tile
// ============================================================

const LOCATIONS_JSON = path.join(TOURS_DIR, 'locations.json');

function getCustomLocationNames() {
    if (fs.existsSync(LOCATIONS_JSON)) {
        try {
            return JSON.parse(fs.readFileSync(LOCATIONS_JSON, 'utf-8'));
        } catch (e) {}
    }
    return {};
}

function saveCustomLocationNames(namesMap) {
    fs.writeFileSync(LOCATIONS_JSON, JSON.stringify(namesMap, null, 2), 'utf-8');
}

// ============================================================
// API: GET /api/locations — Lấy danh sách địa điểm trong tours/
// ============================================================
app.get('/api/locations', (req, res) => {
    try {
        const locations = [];
        const customNames = getCustomLocationNames();
        if (fs.existsSync(TOURS_DIR)) {
            const dirs = fs.readdirSync(TOURS_DIR);
            dirs.forEach(d => {
                const locPath = path.join(TOURS_DIR, d);
                if (fs.statSync(locPath).isDirectory()) {
                    const xmlPath = path.join(locPath, 'scenes.xml');
                    if (fs.existsSync(xmlPath)) {
                        const defaultName = d.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        locations.push({
                            id: d,
                            name: customNames[d] || defaultName,
                            xmlPath: `tours/${d}/scenes.xml`
                        });
                    }
                }
            });
        }
        res.json({ success: true, locations });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: POST /api/locations/rename — Đổi tên hiển thị của Địa Điểm
app.post('/api/locations/rename', async (req, res) => {
    try {
        const { locationId, newName } = req.body;
        if (!locationId || !newName || !newName.trim()) {
            return res.status(400).json({ success: false, error: 'Thiếu thông tin địa điểm hoặc tên mới' });
        }

        const customNames = getCustomLocationNames();
        customNames[locationId] = newName.trim();
        saveCustomLocationNames(customNames);

        res.json({ success: true, message: `Đã đổi tên địa điểm thành "${newName.trim()}"` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: POST /api/locations/create — Tạo thư mục địa điểm mới
app.post('/api/locations/create', async (req, res) => {
    try {
        let { locationId, locationName } = req.body;
        if (!locationId && !locationName) {
            return res.status(400).json({ success: false, error: 'Thiếu thông tin địa điểm' });
        }

        let rawId = locationId || locationName;
        let sanitizedId = rawId
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_\-]/g, '')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

        if (!sanitizedId) sanitizedId = `diaDiem_${Date.now()}`;

        const locDir = path.join(TOURS_DIR, sanitizedId);
        if (!fs.existsSync(locDir)) {
            fs.mkdirSync(locDir, { recursive: true });
        }

        const xmlPath = path.join(locDir, 'scenes.xml');
        if (!fs.existsSync(xmlPath)) {
            fs.writeFileSync(xmlPath, `<krpano>\n</krpano>\n`, 'utf-8');
        }

        await addIncludeToTourXml(sanitizedId);

        res.json({
            success: true,
            locationId: sanitizedId,
            locationName: locationName || sanitizedId,
            message: `Đã tạo địa điểm "${sanitizedId}"`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/upload-pano-multi', upload.array('panoramas', 20), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: 'Không có file nào được upload' });
    }

    let locationId = (req.body.locationId || '').trim();
    if (!locationId) {
        // Fallback: Group all files in this batch into a single shared location folder
        locationId = `dia_diem_${Date.now()}`;
    }

    const customNames = req.body.sceneNames ? JSON.parse(req.body.sceneNames) : [];
    const customTitles = req.body.sceneTitles ? JSON.parse(req.body.sceneTitles) : [];
    const batchJobId = `batch_${Date.now()}`;
    const fileJobs = [];

    const sceneDir = path.join(TOURS_DIR, locationId);
    fs.mkdirSync(sceneDir, { recursive: true });

    // Track used scene names to prevent collision inside the same batch
    const usedNames = new Set();

    for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        let sceneName = (customNames[i] || '').trim();
        if (!sceneName) {
            sceneName = path.basename(file.originalname, path.extname(file.originalname));
        }

        sceneName = sceneName
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_\-]/g, '')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

        if (!sceneName) sceneName = `scene_${i + 1}`;

        // Ensure unique sceneName within the location folder
        let finalSceneName = sceneName;
        let counter = 1;
        while (usedNames.has(finalSceneName)) {
            finalSceneName = `${sceneName}_${counter}`;
            counter++;
        }
        usedNames.add(finalSceneName);

        const customTitle = (customTitles[i] || '').trim() || finalSceneName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const tempSourceImage = path.join(sceneDir, `${finalSceneName}${ext}`);
        fs.renameSync(file.path, tempSourceImage);

        fileJobs.push({
            sourceImage: tempSourceImage,
            sceneDir,
            locationId: locationId,
            sceneName: finalSceneName,
            customTitle
        });
    }

    res.json({
        success: true,
        batchJobId,
        totalFiles: fileJobs.length,
        message: `Đã nhận ${fileJobs.length} ảnh. Đang xử lý vào địa điểm "${locationId}"...`
    });

    processBatchJobs(batchJobId, fileJobs);
});

async function processBatchJobs(batchJobId, fileJobs) {
    const total = fileJobs.length;
    for (let i = 0; i < total; i++) {
        const job = fileJobs[i];
        tilingJobs.set(batchJobId, {
            status: 'processing',
            currentIndex: i + 1,
            totalFiles: total,
            currentSceneName: job.sceneName,
            progress: Math.floor((i / total) * 100)
        });

        try {
            await runKrPanoTiling(job.sourceImage, job.sceneDir, job.sceneName, `${batchJobId}_${i}`);
            await fixScenesXml(job.sceneDir, job.sceneName, job.customTitle);
            await addIncludeToTourXml(job.locationId);
        } catch (err) {
            console.error(`❌ Lỗi batch tiling cho ${job.sceneName}:`, err.message);
        }
    }

    tilingJobs.set(batchJobId, {
        status: 'done',
        totalFiles: total,
        progress: 100
    });
}

// API: POST /api/scenes/rename — Đổi tên Tiêu đề Cảnh (Title)
app.post('/api/scenes/rename', async (req, res) => {
    try {
        const { sceneId, newTitle } = req.body;
        if (!sceneId || !newTitle) {
            return res.status(400).json({ success: false, error: 'Thiếu sceneId hoặc newTitle' });
        }

        const tourXml = fs.readFileSync(TOUR_XML_PATH, 'utf-8');
        const includeRegex = /<include\s+url="([^"]+)"\s*\/>/g;
        let match;
        let targetFile = null;

        while ((match = includeRegex.exec(tourXml)) !== null) {
            const includeUrl = match[1];
            if (includeUrl.startsWith('tours/') && includeUrl.endsWith('.xml')) {
                const filePath = path.join(PROJECT_ROOT, includeUrl);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    if (content.includes(`name="${sceneId}"`)) {
                        targetFile = filePath;
                        break;
                    }
                }
            }
        }

        if (!targetFile) {
            return res.status(404).json({ success: false, error: `Không tìm thấy scene "${sceneId}"` });
        }

        let content = fs.readFileSync(targetFile, 'utf-8');
        const sceneTitleRegex = new RegExp(`(<scene[^>]*name="${escapeRegex(sceneId)}"[^>]*title=")[^"]*(")`, 'i');
        content = content.replace(sceneTitleRegex, `$1${newTitle.trim()}$2`);

        fs.writeFileSync(targetFile, content, 'utf-8');
        res.json({ success: true, message: `Đã đổi tên cảnh thành "${newTitle.trim()}"` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: POST /api/scenes/move-location — Di chuyển cảnh từ Địa điểm A sang Địa điểm B
app.post('/api/scenes/move-location', async (req, res) => {
    try {
        const { sceneId, targetLocationId } = req.body;
        if (!sceneId || !targetLocationId) {
            return res.status(400).json({ success: false, error: 'Thiếu sceneId hoặc targetLocationId' });
        }

        // 1. Find source scenes.xml containing sceneId
        const tourXml = fs.readFileSync(TOUR_XML_PATH, 'utf-8');
        const includeRegex = /<include\s+url="([^"]+)"\s*\/>/g;
        let match;
        let sourceFile = null;
        let sourceIncludeUrl = null;

        while ((match = includeRegex.exec(tourXml)) !== null) {
            const includeUrl = match[1];
            if (includeUrl.startsWith('tours/') && includeUrl.endsWith('.xml')) {
                const filePath = path.join(PROJECT_ROOT, includeUrl);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    if (content.includes(`name="${sceneId}"`)) {
                        sourceFile = filePath;
                        sourceIncludeUrl = includeUrl;
                        break;
                    }
                }
            }
        }

        if (!sourceFile) {
            return res.status(404).json({ success: false, error: `Không tìm thấy cảnh "${sceneId}"` });
        }

        const sourceDir = path.dirname(sourceFile);
        const sourceLocId = path.basename(sourceDir);

        if (sourceLocId === targetLocationId) {
            return res.json({ success: true, message: 'Cảnh đã ở sẵn trong địa điểm này' });
        }

        // 2. Extract scene XML block from source
        let sourceContent = fs.readFileSync(sourceFile, 'utf-8');
        const sceneRegex = new RegExp(`(<scene[^>]*name="${escapeRegex(sceneId)}"[^>]*>[\\s\\S]*?<\\/scene>)`, 'i');
        const sceneMatch = sourceContent.match(sceneRegex);

        if (!sceneMatch) {
            return res.status(404).json({ success: false, error: `Không thể trích xuất thẻ scene "${sceneId}"` });
        }

        const sceneXmlBlock = sceneMatch[1];

        // 3. Target file setup
        const targetDir = path.join(TOURS_DIR, targetLocationId);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        const targetFile = path.join(targetDir, 'scenes.xml');

        // Move physical tiles folder if present
        const sceneNameClean = sceneId.replace(/^scene_/, '');
        const srcPanos = path.join(sourceDir, 'panos', `${sceneNameClean}.tiles`);
        const dstPanosDir = path.join(targetDir, 'panos');
        const dstPanos = path.join(dstPanosDir, `${sceneNameClean}.tiles`);

        if (fs.existsSync(srcPanos)) {
            if (!fs.existsSync(dstPanosDir)) {
                fs.mkdirSync(dstPanosDir, { recursive: true });
            }
            try {
                fs.cpSync(srcPanos, dstPanos, { recursive: true });
                fs.rmSync(srcPanos, { recursive: true, force: true });
                console.log(`   📦 Đã chuyển folder tiles từ ${srcPanos} -> ${dstPanos}`);
            } catch (e) {
                console.warn(`   ⚠️ Không thể di chuyển folder tiles:`, e.message);
            }
        }

        // 4. Remove scene from source file
        sourceContent = sourceContent.replace(sceneRegex, '');
        fs.writeFileSync(sourceFile, sourceContent, 'utf-8');

        // 5. Append scene to target file
        let targetContent = '';
        if (fs.existsSync(targetFile)) {
            targetContent = fs.readFileSync(targetFile, 'utf-8');
            targetContent = targetContent.replace('</krpano>', `\n\t${sceneXmlBlock}\n</krpano>`);
        } else {
            targetContent = `<krpano>\n\t${sceneXmlBlock}\n</krpano>`;
        }
        fs.writeFileSync(targetFile, targetContent, 'utf-8');

        // 6. Ensure targetIncludeUrl is in tour.xml
        await addIncludeToTourXml(targetLocationId);

        // 7. If source file is now empty, prune source include from tour.xml
        if (!sourceContent.includes('<scene')) {
            let tourContent = fs.readFileSync(TOUR_XML_PATH, 'utf-8');
            const incRegex = new RegExp(`\\s*<include\\s+url="${escapeRegex(sourceIncludeUrl)}"\\s*\\/>`, 'gi');
            tourContent = tourContent.replace(incRegex, '');
            fs.writeFileSync(TOUR_XML_PATH, tourContent, 'utf-8');
            console.log(`   🗑️ Đã xóa include "${sourceIncludeUrl}" khỏi tour.xml`);
        }

        res.json({
            success: true,
            message: `Đã di chuyển cảnh thành công sang địa điểm mới!`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: POST /api/scenes/delete — Xóa cảnh khỏi scenes.xml
app.post('/api/scenes/delete', async (req, res) => {
    try {
        const { sceneId } = req.body;
        if (!sceneId) {
            return res.status(400).json({ success: false, error: 'Thiếu sceneId' });
        }

        const tourXml = fs.readFileSync(TOUR_XML_PATH, 'utf-8');
        const includeRegex = /<include\s+url="([^"]+)"\s*\/>/g;
        let match;
        let targetFile = null;
        let targetIncludeUrl = null;

        while ((match = includeRegex.exec(tourXml)) !== null) {
            const includeUrl = match[1];
            if (includeUrl.startsWith('tours/') && includeUrl.endsWith('.xml')) {
                const filePath = path.join(PROJECT_ROOT, includeUrl);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    if (content.includes(`name="${sceneId}"`)) {
                        targetFile = filePath;
                        targetIncludeUrl = includeUrl;
                        break;
                    }
                }
            }
        }

        if (!targetFile) {
            return res.status(404).json({ success: false, error: `Không tìm thấy scene "${sceneId}"` });
        }

        let content = fs.readFileSync(targetFile, 'utf-8');
        const sceneRegex = new RegExp(`\\s*<scene[^>]*name="${escapeRegex(sceneId)}"[^>]*>[\\s\\S]*?<\\/scene>`, 'gi');
        content = content.replace(sceneRegex, '');

        // Write updated XML content back to disk!
        fs.writeFileSync(targetFile, content, 'utf-8');
        console.log(`   🗑️ Đã xóa scene "${sceneId}" khỏi ${targetFile}`);

        // Clean up physical tiles folder on disk if present
        const sceneNameClean = sceneId.replace(/^scene_/, '');
        const targetDir = path.dirname(targetFile);
        const tilesFolder1 = path.join(targetDir, 'panos', `${sceneNameClean}.tiles`);
        const tilesFolder2 = path.join(targetDir, `${sceneNameClean}.tiles`);
        [tilesFolder1, tilesFolder2].forEach(tf => {
            if (fs.existsSync(tf)) {
                try {
                    fs.rmSync(tf, { recursive: true, force: true });
                    console.log(`   🗑️ Đã dọn dẹp thư mục tiles: ${tf}`);
                } catch (e) {}
            }
        });

        // If file contains no more <scene> tags, remove <include> from tour.xml and remove empty folder
        if (!content.includes('<scene')) {
            let tourContent = fs.readFileSync(TOUR_XML_PATH, 'utf-8');
            const incRegex = new RegExp(`\\s*<include\\s+url="${escapeRegex(targetIncludeUrl)}"\\s*\\/>`, 'gi');
            tourContent = tourContent.replace(incRegex, '');
            fs.writeFileSync(TOUR_XML_PATH, tourContent, 'utf-8');
            console.log(`   🗑️ Đã xóa include "${targetIncludeUrl}" khỏi tour.xml vì địa điểm không còn scene nào`);

            try {
                fs.unlinkSync(targetFile);
                const panosSubDir = path.join(targetDir, 'panos');
                if (fs.existsSync(panosSubDir) && fs.readdirSync(panosSubDir).length === 0) {
                    fs.rmdirSync(panosSubDir);
                }
                if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length === 0) {
                    fs.rmdirSync(targetDir);
                }
            } catch (cleanErr) {}
        }

        res.json({ success: true, message: `Đã xóa cảnh "${sceneId}" và dọn dẹp toàn bộ dữ liệu liên quan` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/upload-pano', upload.single('panorama'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'Không có file nào được upload' });
    }

    let sceneName = (req.body.sceneName || '').trim();
    if (!sceneName) {
        sceneName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    }
    
    sceneName = sceneName
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_\-]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

    if (!sceneName) {
        sceneName = `scene_${Date.now()}`;
    }

    const sceneDir = path.join(TOURS_DIR, sceneName);
    const jobId = `job_${Date.now()}`;

    if (fs.existsSync(sceneDir)) {
        fs.unlinkSync(req.file.path);
        return res.status(409).json({ 
            success: false, 
            error: `Scene "${sceneName}" đã tồn tại. Vui lòng chọn tên khác.` 
        });
    }

    fs.mkdirSync(sceneDir, { recursive: true });
    const ext = path.extname(req.file.originalname);
    const sourceImage = path.join(sceneDir, `${sceneName}${ext}`);
    fs.renameSync(req.file.path, sourceImage);

    res.json({ 
        success: true, 
        jobId, 
        sceneName,
        message: `Đã nhận ảnh. Đang tạo tiles cho "${sceneName}"...` 
    });

    tilingJobs.set(jobId, { status: 'processing', sceneName, progress: 0 });

    try {
        await runKrPanoTiling(sourceImage, sceneDir, sceneName, jobId);
        await fixScenesXml(sceneDir, sceneName, req.body.customTitle);
        await addIncludeToTourXml(sceneName);

        tilingJobs.set(jobId, { status: 'done', sceneName, progress: 100 });
    } catch (err) {
        tilingJobs.set(jobId, { status: 'error', sceneName, error: err.message });
    }
});

// SSE endpoint to stream tiling progress
app.get('/api/tiling-status/:jobId', (req, res) => {
    const { jobId } = req.params;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const interval = setInterval(() => {
        const job = tilingJobs.get(jobId);
        if (!job) {
            res.write(`data: ${JSON.stringify({ status: 'unknown' })}\n\n`);
            clearInterval(interval);
            res.end();
            return;
        }

        res.write(`data: ${JSON.stringify(job)}\n\n`);

        if (job.status === 'done' || job.status === 'error') {
            clearInterval(interval);
            // Clean up job after sending final status
            setTimeout(() => tilingJobs.delete(jobId), 5000);
            res.end();
        }
    }, 500);

    req.on('close', () => clearInterval(interval));
});

/**
 * Run krpanotools64.exe makepano with custom config
 */
function runKrPanoTiling(sourceImage, outputDir, sceneName, jobId) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(KRPANO_TOOLS)) {
            return reject(new Error(`Không tìm thấy krpanotools64.exe tại: ${KRPANO_TOOLS}`));
        }

        // Build command args — use -parseoptions=overwrite to prevent interactive prompts from hanging
        const args = [
            'makepano',
            `-config=${KRPANO_CONFIG}`,
            sourceImage
        ];

        console.log(`   Command: ${KRPANO_TOOLS} ${args.join(' ')}`);

        const child = execFile(KRPANO_TOOLS, args, { 
            cwd: path.dirname(KRPANO_CONFIG),
            maxBuffer: 10 * 1024 * 1024,
            timeout: 300000 // 5 minute timeout
        }, (error, stdout, stderr) => {
            if (error) {
                console.error('   krpano stderr:', stderr);
                return reject(new Error(`krpanotools thất bại: ${stderr || error.message}`));
            }
            console.log('   krpano output:', stdout);
            resolve(stdout);
        });

        // Update progress estimate based on time elapsed
        let elapsed = 0;
        const progressTimer = setInterval(() => {
            elapsed += 1;
            const progress = Math.min(90, Math.floor((elapsed / 30) * 90));
            const job = tilingJobs.get(jobId);
            if (job && job.status === 'processing') {
                job.progress = progress;
            }
        }, 1000);

        child.on('exit', () => clearInterval(progressTimer));
    });
}

/**
 * Fix the auto-generated scenes.xml to have correct relative paths
 * and proper scene title
 */
async function fixScenesXml(sceneDir, sceneName, customTitle) {
    const scenesXmlPath = path.join(sceneDir, 'scenes.xml');
    const tempSceneXmlPath = path.join(sceneDir, `${sceneName}.xml`);
    const panosDir = path.join(sceneDir, 'panos');
    
    // Find the .tiles directory name
    let tilesDirName = `${sceneName}.tiles`;
    if (fs.existsSync(panosDir)) {
        const items = fs.readdirSync(panosDir);
        const found = items.find(i => i.endsWith('.tiles') && (i.startsWith(sceneName) || i === `${sceneName}.tiles`));
        if (found) tilesDirName = found;
    }

    const title = customTitle || sceneName
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

    let thumbUrl = `panos/${tilesDirName}/thumb.jpg`;
    if (!fs.existsSync(path.join(panosDir, tilesDirName, 'thumb.jpg')) && fs.existsSync(path.join(panosDir, tilesDirName, 'preview.jpg'))) {
        thumbUrl = `panos/${tilesDirName}/preview.jpg`;
    } else if (fs.existsSync(path.join(panosDir, 'thumb.jpg'))) {
        thumbUrl = `panos/thumb.jpg`;
    }

    const previewUrl = `panos/${tilesDirName}/preview.jpg`;

    // Detect level directories inside panos/{tilesDirName}/f/ (e.g. l1, l2, l3, l4)
    const faceDir = path.join(panosDir, tilesDirName, 'f');
    let levelsXml = '';
    
    if (fs.existsSync(faceDir)) {
        const levelDirs = fs.readdirSync(faceDir)
            .filter(d => d.startsWith('l'))
            .sort((a, b) => {
                const numA = parseInt(a.replace('l', ''), 10);
                const numB = parseInt(b.replace('l', ''), 10);
                return numB - numA;
            });

        if (levelDirs.length > 0) {
            levelsXml = levelDirs.map(lDir => {
                const lNum = parseInt(lDir.replace('l', ''), 10);
                const dim = 320 * Math.pow(2, lNum);
                return `\t\t\t<level tiledimagewidth="${dim}" tiledimageheight="${dim}">\n\t\t\t\t<cube url="panos/${tilesDirName}/%s/${lDir}/%0v/${lDir}_%s_%0v_%0h.jpg" />\n\t\t\t</level>`;
            }).join('\n');
        }
    }

    if (!levelsXml) {
        levelsXml = `\t\t\t<cube url="panos/${tilesDirName}/%s/l%l/%0v/l%l_%s_%0v_%0h.jpg" />`;
    }

    const sceneBlock = `\t<scene name="scene_${sceneName}" title="${title}" thumburl="${thumbUrl}">
\t\t<preview url="${previewUrl}" />
\t\t<image type="CUBE" multires="true" tilesize="512">
${levelsXml}
\t\t</image>
\t</scene>`;

    let content = '';
    if (fs.existsSync(scenesXmlPath)) {
        content = fs.readFileSync(scenesXmlPath, 'utf-8');
        const oldSceneRegex = new RegExp(`\\s*<scene[^>]*name="scene_${escapeRegex(sceneName)}"[^>]*>[\\s\\S]*?<\\/scene>`, 'gi');
        content = content.replace(oldSceneRegex, '');
        if (content.includes('</krpano>')) {
            content = content.replace('</krpano>', `${sceneBlock}\n</krpano>`);
        } else {
            content = `<krpano>\n${sceneBlock}\n</krpano>\n`;
        }
    } else {
        content = `<krpano>\n${sceneBlock}\n</krpano>\n`;
    }

    fs.writeFileSync(scenesXmlPath, content, 'utf-8');
    
    // Clean up temp XML file if generated
    if (fs.existsSync(tempSceneXmlPath)) {
        try { fs.unlinkSync(tempSceneXmlPath); } catch (e) {}
    }

    // Clean up original source image file if present in sceneDir
    if (fs.existsSync(sceneDir)) {
        const files = fs.readdirSync(sceneDir);
        files.forEach(f => {
            if (f.toLowerCase().startsWith(sceneName.toLowerCase()) && !f.endsWith('.xml') && !f.endsWith('.tiles')) {
                const fp = path.join(sceneDir, f);
                if (fs.statSync(fp).isFile()) {
                    try { fs.unlinkSync(fp); } catch (e) {}
                }
            }
        });
    }

    console.log(`   📝 Đã bổ sung scene "scene_${sceneName}" vào ${scenesXmlPath}`);
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Add <include url="tours/{sceneName}/scenes.xml" /> to tour.xml
 */
async function addIncludeToTourXml(sceneName) {
    const includeUrl = `tours/${sceneName}/scenes.xml`;
    const scenesXmlPath = path.join(PROJECT_ROOT, includeUrl);

    // Verify scenes.xml actually exists on disk and contains scene tags before including
    if (!fs.existsSync(scenesXmlPath)) {
        console.log(`   ⚠️ Chưa tạo include cho ${includeUrl} vì file chưa tồn tại trên ổ đĩa`);
        return;
    }

    const xmlContent = fs.readFileSync(scenesXmlPath, 'utf-8');
    if (!xmlContent.includes('<scene')) {
        console.log(`   ⚠️ Chưa tạo include cho ${includeUrl} vì chưa chứa cảnh (<scene>) nào`);
        return;
    }

    let content = fs.readFileSync(TOUR_XML_PATH, 'utf-8');

    // Check if already included
    if (content.includes(includeUrl)) {
        console.log(`   ℹ️ Include đã tồn tại trong tour.xml`);
        return;
    }

    const startupMarker = '<!-- Startup: Load the first scene -->';
    const newInclude = `\t<include url="${includeUrl}" />\n`;

    if (content.includes(startupMarker)) {
        content = content.replace(startupMarker, `${newInclude}\n\t${startupMarker}`);
    } else {
        content = content.replace('</krpano>', `${newInclude}\n</krpano>`);
    }

    fs.writeFileSync(TOUR_XML_PATH, content, 'utf-8');
    console.log(`   📝 Đã thêm <include> vào tour.xml: ${includeUrl}`);
}

// ============================================================
// API: POST /api/scenes/save — Lưu hotspots vào scenes.xml
// ============================================================

app.post('/api/scenes/save', async (req, res) => {
    try {
        const { sceneId, hotspots } = req.body;

        if (!sceneId) {
            return res.status(400).json({ success: false, error: 'Thiếu sceneId' });
        }

        // Find which scenes.xml file contains this scene
        const tourXml = fs.readFileSync(TOUR_XML_PATH, 'utf-8');
        const includeRegex = /<include\s+url="([^"]+)"\s*\/>/g;
        let match;
        let targetFile = null;

        while ((match = includeRegex.exec(tourXml)) !== null) {
            const includeUrl = match[1];
            if (includeUrl.startsWith('tours/') && includeUrl.endsWith('.xml')) {
                const filePath = path.join(PROJECT_ROOT, includeUrl);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    if (content.includes(`name="${sceneId}"`)) {
                        targetFile = filePath;
                        break;
                    }
                }
            }
        }

        if (!targetFile) {
            return res.status(404).json({ 
                success: false, 
                error: `Không tìm thấy file XML chứa scene "${sceneId}"` 
            });
        }

        // Parse the XML
        let content = fs.readFileSync(targetFile, 'utf-8');
        const parsed = await xml2js.parseStringPromise(content, { 
            explicitArray: true,
            preserveChildrenOrder: true,
            explicitChildren: true
        });

        // Rebuild: remove old hotspots, add new ones
        // Strategy: regex-based replacement for reliability with KrPano's XML format
        
        // Remove existing hotspots within this scene
        const sceneRegex = new RegExp(
            `(<scene[^>]*name="${escapeRegex(sceneId)}"[^>]*>)([\\s\\S]*?)(</scene>)`,
            'i'
        );
        
        const sceneMatch = content.match(sceneRegex);
        if (!sceneMatch) {
            return res.status(404).json({ 
                success: false, 
                error: `Scene "${sceneId}" không tìm thấy trong file XML` 
            });
        }

        const sceneOpenTag = sceneMatch[1];
        let sceneBody = sceneMatch[2];
        const sceneCloseTag = sceneMatch[3];

        // Remove existing hotspot tags
        sceneBody = sceneBody.replace(/<hotspot\s[^\/]*\/>/g, '');
        // Also remove hotspot tags with closing tag
        sceneBody = sceneBody.replace(/<hotspot\s[^>]*>[\s\S]*?<\/hotspot>/g, '');
        // Clean up empty lines left behind
        sceneBody = sceneBody.replace(/\n\s*\n\s*\n/g, '\n');

        // Build new hotspot XML tags
        let hotspotsXml = '';
        if (hotspots && hotspots.length > 0) {
            hotspotsXml = '\n';
            hotspots.forEach(h => {
                let showTitleAttr = (h.show_title === 'false' || h.show_title === false) ? ' show_title="false"' : '';
                let showThumbAttr = (h.show_thumb === 'false' || h.show_thumb === false) ? ' show_thumb="false"' : '';

                if (h.style === 'thongtin') {
                    hotspotsXml += `\t\t<hotspot name="${h.name}" style="${h.style}" ath="${h.ath}" atv="${h.atv}" infoid="${h.infoid || ''}" custom_title="${h.custom_title || ''}"${showTitleAttr}${showThumbAttr} />\n`;
                } else {
                    hotspotsXml += `\t\t<hotspot name="${h.name}" style="${h.style}" ath="${h.ath}" atv="${h.atv}" linkedscene="${h.linkedscene || ''}" custom_title="${h.custom_title || ''}"${showTitleAttr}${showThumbAttr} />\n`;
                }
            });
        }

        // Rebuild scene content
        const newSceneContent = sceneOpenTag + sceneBody.trimEnd() + hotspotsXml + '\t' + sceneCloseTag;
        content = content.replace(sceneRegex, newSceneContent);

        // Write back
        fs.writeFileSync(targetFile, content, 'utf-8');

        res.json({ 
            success: true, 
            message: `Đã lưu ${hotspots ? hotspots.length : 0} hotspot(s) vào ${path.basename(targetFile)}`,
            file: targetFile
        });

        console.log(`💾 Saved ${hotspots ? hotspots.length : 0} hotspot(s) for scene "${sceneId}" → ${path.basename(targetFile)}`);
    } catch (err) {
        console.error('Save error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// API: POST /api/scenes/view — Lưu khung nhìn mặc định (view)
// ============================================================

app.post('/api/scenes/view', async (req, res) => {
    try {
        const { sceneId, hlookat, vlookat, fov, fovmin, fovmax, maxpixelzoom } = req.body;

        if (!sceneId) {
            return res.status(400).json({ success: false, error: 'Thiếu sceneId' });
        }

        const h = parseFloat(hlookat || 0).toFixed(1);
        const v = parseFloat(vlookat || 0).toFixed(1);
        const f = parseFloat(fov || 100).toFixed(1);
        const fmin = parseFloat(fovmin || 60).toFixed(0);
        const fmax = parseFloat(fovmax || 95).toFixed(0);
        const mpz = parseFloat(maxpixelzoom || 2.0).toFixed(1);

        // Find which scenes.xml file contains this scene
        const tourXml = fs.readFileSync(TOUR_XML_PATH, 'utf-8');
        const includeRegex = /<include\s+url="([^"]+)"\s*\/>/g;
        let match;
        let targetFile = null;

        while ((match = includeRegex.exec(tourXml)) !== null) {
            const includeUrl = match[1];
            if (includeUrl.startsWith('tours/') && includeUrl.endsWith('.xml')) {
                const filePath = path.join(PROJECT_ROOT, includeUrl);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    if (content.includes(`name="${sceneId}"`)) {
                        targetFile = filePath;
                        break;
                    }
                }
            }
        }

        if (!targetFile) {
            return res.status(404).json({ 
                success: false, 
                error: `Không tìm thấy file XML chứa scene "${sceneId}"` 
            });
        }

        let content = fs.readFileSync(targetFile, 'utf-8');

        // Regex for the scene block
        const sceneRegex = new RegExp(
            `(<scene[^>]*name="${escapeRegex(sceneId)}"[^>]*>)([\\s\\S]*?)(</scene>)`,
            'i'
        );

        const sceneMatch = content.match(sceneRegex);
        if (!sceneMatch) {
            return res.status(404).json({ 
                success: false, 
                error: `Scene "${sceneId}" không tìm thấy trong file XML` 
            });
        }

        const sceneOpenTag = sceneMatch[1];
        let sceneBody = sceneMatch[2];
        const sceneCloseTag = sceneMatch[3];

        const viewTagRegex = /<view\s+[^>]*\/>/i;
        const newViewTag = `\t\t<view hlookat="${h}" vlookat="${v}" fov="${f}" maxpixelzoom="${mpz}" fovmin="${fmin}" fovmax="${fmax}" />`;

        if (viewTagRegex.test(sceneBody)) {
            sceneBody = sceneBody.replace(viewTagRegex, newViewTag.trim());
        } else {
            sceneBody = `\n${newViewTag}` + sceneBody;
        }

        const newSceneContent = sceneOpenTag + sceneBody.trimEnd() + '\n\t' + sceneCloseTag;
        content = content.replace(sceneRegex, newSceneContent);

        fs.writeFileSync(targetFile, content, 'utf-8');

        console.log(`🎥 Đã lưu view cho scene "${sceneId}": h=${h}°, v=${v}°, fov=${f}°, fovmin=${fmin}°, fovmax=${fmax}°, pixelzoom=${mpz}x → ${path.basename(targetFile)}`);

        res.json({
            success: true,
            message: `Đã lưu view (fov: ${f}°, fovmin: ${fmin}°, fovmax: ${fmax}°, pixelzoom: ${mpz}x)`,
            view: { hlookat: h, vlookat: v, fov: f, fovmin: fmin, fovmax: fmax, maxpixelzoom: mpz }
        });
    } catch (err) {
        console.error('Save view error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// API: DELETE /api/scenes/:sceneId — Xóa một scene
// ============================================================

app.delete('/api/scenes/:sceneId', async (req, res) => {
    try {
        const { sceneId } = req.params;

        // Find and remove from scenes.xml
        const tourXml = fs.readFileSync(TOUR_XML_PATH, 'utf-8');
        const includeRegex = /<include\s+url="([^"]+)"\s*\/>/g;
        let match;
        let removedFrom = null;

        while ((match = includeRegex.exec(tourXml)) !== null) {
            const includeUrl = match[1];
            if (includeUrl.startsWith('tours/') && includeUrl.endsWith('.xml')) {
                const filePath = path.join(PROJECT_ROOT, includeUrl);
                if (fs.existsSync(filePath)) {
                    let content = fs.readFileSync(filePath, 'utf-8');
                    if (content.includes(`name="${sceneId}"`)) {
                        // Remove the scene block
                        const sceneRegex = new RegExp(
                            `\\s*<scene[^>]*name="${escapeRegex(sceneId)}"[^>]*>[\\s\\S]*?</scene>`,
                            'i'
                        );
                        content = content.replace(sceneRegex, '');
                        fs.writeFileSync(filePath, content, 'utf-8');
                        removedFrom = includeUrl;
                        break;
                    }
                }
            }
        }

        if (!removedFrom) {
            return res.status(404).json({ success: false, error: `Không tìm thấy scene "${sceneId}"` });
        }

        res.json({ success: true, message: `Đã xóa scene "${sceneId}" khỏi ${removedFrom}` });
        console.log(`🗑️ Deleted scene "${sceneId}" from ${removedFrom}`);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// ERROR HANDLING
// ============================================================

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: 'File quá lớn. Tối đa 200MB.' });
        }
    }
    console.error('Server error:', err);
    res.status(500).json({ success: false, error: err.message });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║   🌐 Ninh Phước 360 — Editor Server                     ║
║   ─────────────────────────────────────────────────────  ║
║   Editor:  http://localhost:${PORT}/editor.html              ║
║   ─────────────────────────────────────────────────────  ║
║   Project: ${PROJECT_ROOT}   ║
║   Dev:     ${DEV_DIR}  ║
║   KrPano:  ${fs.existsSync(KRPANO_TOOLS) ? '✅ Đã tìm thấy' : '❌ Không tìm thấy'}                                ║
║   ─────────────────────────────────────────────────────  ║
║   💡 Khi bàn giao: Xóa thư mục _dev/ là xong!           ║
╚══════════════════════════════════════════════════════════╝
`);
});
