const fs = require('fs');

const tourXmlPaths = [
  'tours/trung_tam_hanh_chinh/scenes.xml',
  'tours/lang_gom/scenes.xml',
  'tours/nha_sinh_hoat/scenes.xml',
  'tours/htx_gom_bautruc/scenes.xml',
  'tours/den_po_klaong_car/scenes.xml',
  'tours/lang_my_nghiep/scenes.xml',
  'tours/bia_tuong_niem_van_phuoc/scenes.xml',
  'tours/nha_tuong_niem_tranthi/scenes.xml',
  'tours/dinh_lang_van_phuoc/scenes.xml'
];

const sceneLocMap = {};
tourXmlPaths.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const loc = file.split('/')[1];
  const regex = /<scene\s+name="([^"\s]+)"/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    sceneLocMap[m[1]] = loc;
  }
});

fs.writeFileSync('core/data/scene-locations.json', JSON.stringify(sceneLocMap, null, 2), 'utf8');
console.log('Saved static sceneLocMap with ' + Object.keys(sceneLocMap).length + ' scenes.');
