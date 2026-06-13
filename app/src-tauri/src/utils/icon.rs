use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::{imageops, DynamicImage, ImageFormat, RgbaImage};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct AppIconCache {
    pub icons: Arc<Mutex<HashMap<String, String>>>, // exe_path → base64 PNG
}

pub fn setup(app: &mut tauri::App) {
    let icon_cache = Arc::new(Mutex::new(HashMap::<String, String>::new()));
    app.manage(AppIconCache {
        icons: Arc::clone(&icon_cache),
    });
}

#[tauri::command]
pub async fn extract_app_icons(
    state: tauri::State<'_, AppIconCache>,
    targets: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    let cache = Arc::clone(&state.icons);
    tauri::async_runtime::spawn_blocking(move || {
        let mut result = HashMap::new();
        for target in targets {
            if let Some(cached) = cache.lock().unwrap().get(&target).cloned() {
                result.insert(target.clone(), cached);
                continue;
            }

            match extract_icon_from_exe(&target) {
                Some(icon_b64) => {
                    cache.lock().unwrap().insert(target.clone(), icon_b64.clone());
                    result.insert(target, icon_b64);
                }
                None => {
                    eprintln!("[DevLauncher] icon extraction failed for: {}", target);
                }
            }
        }
        result
    })
    .await
    .map_err(|e| e.to_string())
}

// ── Raw Win32 FFI ──

#[cfg(target_os = "windows")]
mod win32_ffi {
    #[repr(C)]
    pub struct IconInfo {
        pub f_icon: i32,
        pub x_hotspot: u32,
        pub y_hotspot: u32,
        pub hbm_mask: isize,
        pub hbm_color: isize,
    }

    #[repr(C)]
    pub struct BitmapInfoHeader {
        pub bi_size: u32,
        pub bi_width: i32,
        pub bi_height: i32,
        pub bi_planes: u16,
        pub bi_bit_count: u16,
        pub bi_compression: u32,
        pub bi_size_image: u32,
        pub bi_x_pels_per_meter: i32,
        pub bi_y_pels_per_meter: i32,
        pub bi_clr_used: u32,
        pub bi_clr_important: u32,
    }

    #[link(name = "user32")]
    extern "system" {
        pub fn ExtractIconExW(
            sz_file_name: *const u16,
            n_icon_index: i32,
            ph_icon_large: *mut isize,
            ph_icon_small: *mut isize,
            n_icons: u32,
        ) -> u32;
        pub fn DestroyIcon(h_icon: isize) -> i32;
        pub fn GetIconInfo(h_icon: isize, p_icon_info: *mut IconInfo) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        pub fn CreateCompatibleDC(hdc: isize) -> isize;
        pub fn DeleteDC(hdc: isize) -> i32;
        pub fn DeleteObject(ho: isize) -> i32;
        pub fn GetDIBits(
            hdc: isize,
            hbm: isize,
            start: u32,
            c_lines: u32,
            lpv_bits: *mut u8,
            lp_bi: *mut BitmapInfoHeader,
            usage: u32,
        ) -> i32;
    }
}

#[cfg(target_os = "windows")]
fn extract_icon_from_exe(exe_path: &str) -> Option<String> {
    unsafe {
        let wide: Vec<u16> = exe_path.encode_utf16().chain(std::iter::once(0)).collect();

        let mut hicon_large: isize = 0;
        let mut hicon_small: isize = 0;

        let count =
            win32_ffi::ExtractIconExW(wide.as_ptr(), 0, &mut hicon_large, &mut hicon_small, 1);

        if count == 0 {
            return None;
        }

        let hicon = if hicon_large != 0 {
            hicon_large
        } else {
            hicon_small
        };
        if hicon == 0 {
            return None;
        }

        let result = hicon_to_png(hicon);

        if hicon_large != 0 {
            win32_ffi::DestroyIcon(hicon_large);
        }
        if hicon_small != 0 {
            win32_ffi::DestroyIcon(hicon_small);
        }

        result
    }
}

#[cfg(target_os = "windows")]
unsafe fn hicon_to_png(hicon: isize) -> Option<String> {
    let mut icon_info: win32_ffi::IconInfo = std::mem::zeroed();
    if win32_ffi::GetIconInfo(hicon, &mut icon_info) == 0 {
        return None;
    }

    if icon_info.hbm_color == 0 {
        if icon_info.hbm_mask != 0 {
            win32_ffi::DeleteObject(icon_info.hbm_mask);
        }
        return None;
    }

    let hdc = win32_ffi::CreateCompatibleDC(0);
    if hdc == 0 {
        return None;
    }

    let mut bmi: win32_ffi::BitmapInfoHeader = std::mem::zeroed();
    bmi.bi_size = std::mem::size_of::<win32_ffi::BitmapInfoHeader>() as u32;

    win32_ffi::GetDIBits(
        hdc,
        icon_info.hbm_color,
        0,
        0,
        std::ptr::null_mut(),
        &mut bmi,
        0,
    );

    let width = bmi.bi_width.unsigned_abs() as u32;
    let height = bmi.bi_height.unsigned_abs() as u32;

    if width == 0 || height == 0 || width > 512 || height > 512 {
        win32_ffi::DeleteDC(hdc);
        win32_ffi::DeleteObject(icon_info.hbm_color);
        win32_ffi::DeleteObject(icon_info.hbm_mask);
        return None;
    }

    bmi.bi_height = -(height as i32);
    bmi.bi_bit_count = 32;
    bmi.bi_compression = 0;

    let mut pixels = vec![0u8; (width * height * 4) as usize];

    let scan_lines = win32_ffi::GetDIBits(
        hdc,
        icon_info.hbm_color,
        0,
        height,
        pixels.as_mut_ptr(),
        &mut bmi,
        0,
    );

    win32_ffi::DeleteDC(hdc);
    win32_ffi::DeleteObject(icon_info.hbm_color);
    win32_ffi::DeleteObject(icon_info.hbm_mask);

    if scan_lines == 0 {
        return None;
    }

    for chunk in pixels.chunks_exact_mut(4) {
        let b = chunk[0];
        let g = chunk[1];
        let r = chunk[2];
        let a = chunk[3];

        chunk[0] = r;
        chunk[1] = g;
        chunk[2] = b;
        chunk[3] = a;

        let a_u32 = a as u32;
        if a_u32 > 0 && a_u32 < 255 {
            chunk[0] = ((chunk[0] as u32 * 255 + a_u32 / 2) / a_u32).min(255) as u8;
            chunk[1] = ((chunk[1] as u32 * 255 + a_u32 / 2) / a_u32).min(255) as u8;
            chunk[2] = ((chunk[2] as u32 * 255 + a_u32 / 2) / a_u32).min(255) as u8;
        }

        if chunk[3] == 0 && (chunk[0] > 0 || chunk[1] > 0 || chunk[2] > 0) {
            chunk[3] = 255;
        }
    }

    if let Some(rgba_image) = RgbaImage::from_raw(width, height, pixels) {
        let resized = imageops::resize(&rgba_image, 32, 32, imageops::FilterType::Lanczos3);
        let dynamic = DynamicImage::ImageRgba8(resized);
        let mut png_buf = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut png_buf);
        if dynamic.write_to(&mut cursor, ImageFormat::Png).is_ok() {
            return Some(BASE64.encode(&png_buf));
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn extract_icon_from_exe(_exe_path: &str) -> Option<String> {
    None
}
