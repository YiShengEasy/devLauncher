use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    #[cfg(target_os = "macos")]
    build_macos_translate_helper();
    tauri_build::build()
}

#[cfg(target_os = "macos")]
fn build_macos_translate_helper() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("missing manifest dir"));
    let source = manifest_dir.join("src/macos_translate.swift");
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("missing OUT_DIR"));
    let output = out_dir.join("devlauncher_translate_helper");
    let module_cache = out_dir.join("swift-module-cache");
    std::fs::create_dir_all(&module_cache).expect("failed to create Swift module cache");

    println!("cargo:rerun-if-changed={}", source.display());

    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-O",
            "-parse-as-library",
            "-framework",
            "Translation",
        ])
        .arg(&source)
        .arg("-o")
        .arg(&output)
        .env("CLANG_MODULE_CACHE_PATH", &module_cache)
        .env("SWIFT_MODULE_CACHE_PATH", &module_cache)
        .status()
        .expect("failed to start swift compiler for macOS translation helper");

    if !status.success() {
        panic!("failed to compile macOS translation helper");
    }
}
