// OCR MVP engine: Windows OCR API on Windows. Tesseract fallback is reserved for a separate implementation pass.

#[tauri::command]
pub fn ocr_engine_status() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Ok("windows-ocr-candidate".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok("unsupported-platform".to_string())
    }
}
