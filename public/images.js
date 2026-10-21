export async function imagePreview(blob) {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return { url, width: image.naturalWidth, height: image.naturalHeight };
  } catch (cause) {
    URL.revokeObjectURL(url);
    throw cause;
  }
}

export async function inputPreview(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
    throw new Error('PNG/JPEG 사진을 장당 10 MiB 이하로 선택하세요.');
  }
  const preview = await imagePreview(file);
  if (preview.width > 4096 || preview.height > 4096 || preview.width * preview.height > 20_000_000) {
    URL.revokeObjectURL(preview.url);
    throw new Error('한 변 4096px 이하, 20메가픽셀 이하 사진을 사용하세요.');
  }
  return preview;
}
