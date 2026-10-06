const fs = require('fs');
const path = require('path');

function extractManifest() {
    const toursDir = path.join(__dirname, '..', 'tours');
    const tourXmlPath = path.join(__dirname, '..', 'tour.xml');
    const locationsJsonPath = path.join(toursDir, 'locations.json');
    const sceneLocPath = path.join(__dirname, '..', 'core', 'data', 'scene-locations.json');

    // 1. Nạp locations.json
    let locationsMap = {};
    if (fs.existsSync(locationsJsonPath)) {
        try {
            locationsMap = JSON.parse(fs.readFileSync(locationsJsonPath, 'utf8'));
        } catch (e) { }
    }

    // 2. Nạp scene-locations.json
    let sceneLocMap = {};
    if (fs.existsSync(sceneLocPath)) {
        try {
            sceneLocMap = JSON.parse(fs.readFileSync(sceneLocPath, 'utf8'));
        } catch (e) { }
    }

    // 3. Đọc thứ tự các include trong tour.xml
    let tourOrder = [];
    if (fs.existsSync(tourXmlPath)) {
        const tourContent = fs.readFileSync(tourXmlPath, 'utf8');
        const incRegex = /<include\s+url="tours\/([^\/]+)\/scenes\.xml"\s*\/>/g;
        let incMatch;
        while ((incMatch = incRegex.exec(tourContent)) !== null) {
            tourOrder.push(incMatch[1]);
        }
    }

    if (tourOrder.length === 0) {
        tourOrder = fs.readdirSync(toursDir).filter(t => fs.existsSync(path.join(toursDir, t, 'scenes.xml')));
    }

    const manifest = {
        _meta: {
            startScene: 'scene_toancanh_300m',
            groups: []
        }
    };

    const groupMap = {};

    // 4. Lần lượt quét từng tour theo đúng thứ tự tour.xml
    for (const t of tourOrder) {
        const xmlPath = path.join(toursDir, t, 'scenes.xml');
        if (!fs.existsSync(xmlPath)) continue;

        const content = fs.readFileSync(xmlPath, 'utf8');
        const sceneRegex = /<scene\s+name="([^"]+)"\s+title="([^"]*)"(?:[^>]*thumburl="([^"]*)")?[^>]*>([\s\S]*?)<\/scene>/g;
        let match;

        let groupLabel = t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (locationsMap[t]) {
            if (typeof locationsMap[t] === 'object' && locationsMap[t].name) {
                groupLabel = locationsMap[t].name;
            } else if (typeof locationsMap[t] === 'string') {
                groupLabel = locationsMap[t];
            }
        }

        if (!groupMap[t]) {
            groupMap[t] = {
                id: t,
                label: groupLabel,
                scenes: []
            };
        }

        while ((match = sceneRegex.exec(content)) !== null) {
            const sName = match[1];
            const sTitle = match[2] || sName;
            const thumbUrlAttr = match[3] || '';
            const body = match[4];

            // Preview & TilesDir
            const pMatch = body.match(/<preview\s+url="([^"]+)"/);
            const preview = pMatch ? 'tours/' + t + '/' + pMatch[1] : '';
            let tilesDir = '';
            if (preview) {
                tilesDir = preview.replace(/\/preview\.jpg$/, '');
            }

            // Thumbnail
            let thumb = '';
            if (thumbUrlAttr) {
                thumb = 'tours/' + t + '/' + thumbUrlAttr;
            } else if (tilesDir) {
                thumb = tilesDir + '/thumb.jpg';
            }

            // View tag: hlookat, vlookat, fov
            let hlookat = 0.0;
            let vlookat = 0.0;
            let fov = 100.0;
            const viewMatch = body.match(/<view\s+[^>]*hlookat="([^"]+)"[^>]*vlookat="([^"]+)"(?:[^>]*fov="([^"]+)")?/);
            if (viewMatch) {
                hlookat = parseFloat(viewMatch[1]) || 0.0;
                vlookat = parseFloat(viewMatch[2]) || 0.0;
                if (viewMatch[3]) fov = parseFloat(viewMatch[3]) || 100.0;
            } else {
                const hMatch = body.match(/hlookat="([^"]+)"/);
                const vMatchAlt = body.match(/vlookat="([^"]+)"/);
                if (hMatch) hlookat = parseFloat(hMatch[1]) || 0.0;
                if (vMatchAlt) vlookat = parseFloat(vMatchAlt[1]) || 0.0;
            }

            // Hotspots
            const hsList = [];
            const hsRegex = /<hotspot\s+name="([^"]+)"([^>]*)\/>/g;
            let hm;

            while ((hm = hsRegex.exec(body)) !== null) {
                const hsName = hm[1];
                const attrs = hm[2];

                const athM = attrs.match(/ath="([^"]+)"/);
                const atvM = attrs.match(/atv="([^"]+)"/);
                const linkedM = attrs.match(/linkedscene="([^"]+)"/);
                const styleM = attrs.match(/style="([^"]+)"/);
                const scaleM = attrs.match(/scale="([^"]+)"/);
                const titleM = attrs.match(/(?:custom_title="([^"]*)"|title="([^"]*)")/);

                if (athM && atvM && linkedM) {
                    hsList.push({
                        name: hsName,
                        ath: parseFloat(athM[1]),
                        atv: parseFloat(atvM[1]),
                        linkedscene: linkedM[1],
                        style: styleM ? styleM[1] : 'muiten',
                        scale: scaleM ? parseFloat(scaleM[1]) : 1.0,
                        title: titleM ? (titleM[1] || titleM[2] || '') : ''
                    });
                }
            }

            manifest[sName] = {
                tour: t,
                title: sTitle,
                thumb: thumb,
                preview: preview,
                tilesDir: tilesDir,
                hlookat: hlookat,
                vlookat: vlookat,
                fov: fov,
                hotspots: hsList
            };

            groupMap[t].scenes.push({
                id: sName,
                title: sTitle,
                thumb: thumb
            });
        }
    }

    // Gán groups vào _meta
    manifest._meta.groups = Object.values(groupMap).filter(g => g.scenes.length > 0);

    const outPath = path.join(__dirname, '..', 'core', 'data', 'vr-scenes-manifest.json');
    fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`[Manifest] Đã cập nhật ${Object.keys(manifest).length - 1} cảnh và ${manifest._meta.groups.length} nhóm địa điểm.`);
    return manifest;
}

if (require.main === module) {
    extractManifest();
}

module.exports = { extractManifest };
