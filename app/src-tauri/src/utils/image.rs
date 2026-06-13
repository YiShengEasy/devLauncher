use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::{imageops, DynamicImage, ImageFormat, RgbaImage};

/// Encode an RGBA image to base64 JPEG, resizing if wider than max_width.
/// Returns (base64_string, output_width, output_height).
pub fn encode_image_jpeg(
    rgba: &RgbaImage,
    max_width: u32,
    _quality: u8,
) -> Result<(String, u32, u32), String> {
    let (w, h) = if rgba.width() > max_width {
        let ratio = max_width as f64 / rgba.width() as f64;
        (max_width, (rgba.height() as f64 * ratio) as u32)
    } else {
        (rgba.width(), rgba.height())
    };
    let resized = imageops::resize(rgba, w, h, imageops::FilterType::Triangle);
    let dynamic = DynamicImage::ImageRgba8(resized);
    let rgb_image = dynamic.to_rgb8();
    let dynamic_rgb = DynamicImage::ImageRgb8(rgb_image);
    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    dynamic_rgb
        .write_to(&mut cursor, ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    let base64_str = BASE64.encode(&buf);
    Ok((base64_str, w, h))
}
