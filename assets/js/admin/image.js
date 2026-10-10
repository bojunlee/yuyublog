// 照片處理：在手機上先壓縮成兩種尺寸再上傳，魚魚不用自己縮圖。
// 大圖最長邊 2000px（文章與燈箱用）、小圖 800px（列表卡片用），優先輸出 WebP，不支援就用 JPEG。

const MAX_INPUT = 40 * 1024 * 1024;   // 40 MB 以上的檔案大多不是一般照片
const ACCEPT = /^image\/(jpeg|png|webp|heic|heif|gif|avif)$/i;

export class ImageError extends Error {}

async function decode(file) {
  // createImageBitmap 會依照 EXIF 自動轉正（直拍照片不會躺著）
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { /* 有些瀏覽器不支援參數，改用 <img> */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new ImageError("這個檔案無法讀取，請改用 JPG 或 PNG 照片")); };
    im.src = url;
  });
}

function toBlob(canvas, type, q) {
  return new Promise(res => canvas.toBlob(res, type, q));
}

async function render(src, w, h, max, quality) {
  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, cw, ch);
  let blob = await toBlob(canvas, "image/webp", quality);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality + 0.04);
  canvas.width = canvas.height = 0;   // 盡快釋放手機記憶體
  if (!blob) throw new ImageError("照片壓縮失敗，請再試一次");
  return { blob, w: cw, h: ch };
}

export async function processImage(file, { large = 2000, small = 800 } = {}) {
  if (!file || (file.type && !ACCEPT.test(file.type))) throw new ImageError("只能上傳照片檔（JPG、PNG、HEIC、WebP）");
  if (file.size > MAX_INPUT) throw new ImageError("照片超過 40 MB，請換一張");
  const src = await decode(file);
  const w = src.naturalWidth || src.width;
  const h = src.naturalHeight || src.height;
  if (!w || !h) throw new ImageError("這個檔案無法讀取");
  try {
    const big = await render(src, w, h, large, 0.82);
    const thumb = small ? await render(src, w, h, small, 0.78) : null;
    return { big, thumb };
  } finally {
    if (src.close) src.close();
  }
}

function ext(blob) { return blob.type === "image/webp" ? "webp" : "jpg"; }

// 上傳到 Supabase Storage，回傳存進資料庫的照片物件
export async function uploadImage(sb, file, folder, opts) {
  const { big, thumb } = await processImage(file, opts);
  const d = new Date();
  const base = `${folder}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}`;
  const bucket = sb.storage.from("photos");
  const path = `${base}.${ext(big.blob)}`;
  const up = async (p, b) => {
    const { error } = await bucket.upload(p, b, { contentType: b.type, cacheControl: "31536000", upsert: false });
    if (error) throw new ImageError(error.message && /exceeded|too large/i.test(error.message) ? "照片太大，上傳失敗" : "上傳失敗，請檢查網路後再試一次");
  };
  await up(path, big.blob);
  let thumbPath = null;
  if (thumb) {
    thumbPath = `${base}_sm.${ext(thumb.blob)}`;
    try { await up(thumbPath, thumb.blob); }
    catch (e) { await bucket.remove([path]); throw e; }
  }
  return {
    path,
    url: bucket.getPublicUrl(path).data.publicUrl,
    thumb_path: thumbPath,
    thumb: thumbPath ? bucket.getPublicUrl(thumbPath).data.publicUrl : bucket.getPublicUrl(path).data.publicUrl,
    w: big.w,
    h: big.h,
    caption: ""
  };
}

export function filesOf(photos) {
  return (photos || []).flatMap(p => [p && p.path, p && p.thumb_path]).filter(Boolean);
}

export async function removeImages(sb, photos) {
  const paths = filesOf(photos);
  if (!paths.length) return;
  const { error } = await sb.storage.from("photos").remove(paths);
  if (error) console.warn("清除照片失敗", error);
}
